"""Firestore-backed graph state store.

This module stores graph state as node and edge entities and records an append-only
mutation log per graph. It is designed for gradual migration from file-based storage.
"""

from __future__ import annotations

import hashlib
import os
from typing import Any, Dict, List, Optional, Tuple

try:
    from google.cloud import firestore
except Exception:
    firestore = None


_KNOWN_NODE_FIELDS = {
    "id",
    "title",
    "children",
    "progress",
    "context",
    "due",
    "icon",
    "description",
}


class FirestoreGraphStore:
    """Persist graph state in Firestore as nodes, edges, and mutation events."""

    NODES_COLLECTION = "nodes"
    EDGES_COLLECTION = "edges"
    MUTATIONS_COLLECTION = "mutations"
    SNAPSHOTS_COLLECTION = "snapshots"

    def __init__(self, root_collection: Optional[str] = None):
        self.root_collection = root_collection or os.getenv("FIRESTORE_GRAPH_COLLECTION", "graph_state")
        self.write_snapshots = os.getenv("FIRESTORE_WRITE_SNAPSHOTS", "0").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        self._client = None
        self._client_init_error: Optional[str] = None

    def is_available(self) -> bool:
        """Return whether Firestore client support is available."""
        if firestore is None:
            return False
        try:
            self._get_client()
            return True
        except Exception:
            return False

    def _get_client(self):
        if firestore is None:
            raise RuntimeError("google-cloud-firestore is not installed")
        if self._client is None:
            if self._client_init_error is not None:
                raise RuntimeError(self._client_init_error)
            try:
                self._client = firestore.Client()
            except Exception as error:
                self._client_init_error = f"Firestore client initialization failed: {error}"
                raise RuntimeError(self._client_init_error) from error
        return self._client

    def _graph_ref(self, graph_name: str):
        client = self._get_client()
        return client.collection(self.root_collection).document(graph_name)

    @staticmethod
    def _path_doc_id(path: str) -> str:
        digest = hashlib.sha1(path.encode("utf-8")).hexdigest()
        return f"p_{digest}"

    @staticmethod
    def _key_to_title(key: str) -> str:
        return key.replace("_", " ").title()

    def _extract_children(self, item: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        if not isinstance(item, dict):
            return {}

        explicit_children = item.get("children")
        if isinstance(explicit_children, dict):
            return explicit_children

        children: Dict[str, Dict[str, Any]] = {}
        for key, value in item.items():
            if key in _KNOWN_NODE_FIELDS:
                continue
            if isinstance(value, dict):
                children[key] = value
        return children

    def _flatten_structure(self, structure: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        nodes: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []

        def walk(items: Dict[str, Any], parent_path: Optional[str]):
            if not isinstance(items, dict):
                return

            for order, (key, value) in enumerate(items.items()):
                if key in _KNOWN_NODE_FIELDS:
                    continue

                item = value if isinstance(value, dict) else {}
                path = f"{parent_path}.{key}" if parent_path else key

                node: Dict[str, Any] = {
                    "path": path,
                    "key": key,
                    "title": item.get("title") or self._key_to_title(key),
                    "parent_path": parent_path,
                    "order": order,
                }

                if item.get("progress") is not None:
                    node["progress"] = int(item["progress"])
                if item.get("context") not in (None, ""):
                    node["context"] = str(item["context"])
                if item.get("due") not in (None, ""):
                    node["due"] = str(item["due"])

                nodes.append(node)

                if parent_path is not None:
                    edges.append(
                        {
                            "parent_path": parent_path,
                            "child_path": path,
                            "order": order,
                        }
                    )

                walk(self._extract_children(item), path)

        walk(structure or {}, None)
        return nodes, edges

    @staticmethod
    def _normalize_metadata(metadata: Optional[Dict[str, Any]], graph_name: str, version: int) -> Dict[str, str]:
        source = metadata or {}
        title = str(source.get("title") or graph_name.replace("_", " ").title())
        description = str(source.get("description") or "")
        return {
            "title": title,
            "description": description,
            "version": str(source.get("version") or version or "1.0"),
        }

    def _build_structure_from_nodes(self, nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        children_by_parent: Dict[Optional[str], List[Dict[str, Any]]] = {}
        for node in nodes:
            parent_path = node.get("parent_path")
            children_by_parent.setdefault(parent_path, []).append(node)

        for siblings in children_by_parent.values():
            siblings.sort(key=lambda item: int(item.get("order", 0)))

        def build_item(node: Dict[str, Any]) -> Dict[str, Any]:
            item: Dict[str, Any] = {}
            if node.get("progress") is not None:
                item["progress"] = int(node["progress"])
            if node.get("context") not in (None, ""):
                item["context"] = node["context"]
            if node.get("due") not in (None, ""):
                item["due"] = node["due"]

            child_nodes = children_by_parent.get(node["path"], [])
            for child in child_nodes:
                item[child["key"]] = build_item(child)
            return item

        structure: Dict[str, Any] = {}
        for root_node in children_by_parent.get(None, []):
            structure[root_node["key"]] = build_item(root_node)
        return structure

    def _replace_collection(self, collection_ref, docs_by_id: Dict[str, Dict[str, Any]]) -> None:
        client = self._get_client()
        existing_ids = [doc.id for doc in collection_ref.stream()]

        ops: List[Tuple[str, str, Optional[Dict[str, Any]]]] = []
        for doc_id in existing_ids:
            if doc_id not in docs_by_id:
                ops.append(("delete", doc_id, None))
        for doc_id, payload in docs_by_id.items():
            ops.append(("set", doc_id, payload))

        chunk_size = 400
        for index in range(0, len(ops), chunk_size):
            batch = client.batch()
            chunk = ops[index : index + chunk_size]
            for action, doc_id, payload in chunk:
                doc_ref = collection_ref.document(doc_id)
                if action == "delete":
                    batch.delete(doc_ref)
                else:
                    batch.set(doc_ref, payload)
            batch.commit()

    @staticmethod
    def _timestamp_to_iso(value: Any) -> Any:
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return value

    def get_graph_version(self, graph_name: str) -> int:
        graph_ref = self._graph_ref(graph_name)
        snapshot = graph_ref.get()
        data = snapshot.to_dict() or {}
        try:
            return int(data.get("version", 0))
        except Exception:
            return 0

    def load_graph(self, graph_name: str, fallback_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Load graph from Firestore. Optionally bootstrap from fallback data if empty."""
        graph_ref = self._graph_ref(graph_name)
        graph_snapshot = graph_ref.get()
        graph_data = graph_snapshot.to_dict() or {}

        node_docs = [doc.to_dict() or {} for doc in graph_ref.collection(self.NODES_COLLECTION).stream()]
        if not node_docs:
            if fallback_data is not None:
                self.save_graph(
                    graph_name=graph_name,
                    data=fallback_data,
                    mutation_type="bootstrap_from_file",
                    mutation_payload={"source": "file"},
                    actor="migration",
                )
                return fallback_data

            metadata = self._normalize_metadata({}, graph_name, 1)
            return {
                "metadata": metadata,
                "structure": {},
            }

        version = 0
        try:
            version = int(graph_data.get("version", 0))
        except Exception:
            version = 0

        metadata_source = {
            "title": graph_data.get("title"),
            "description": graph_data.get("description"),
            "version": graph_data.get("version"),
        }
        if fallback_data and isinstance(fallback_data, dict):
            metadata_source = {
                **(fallback_data.get("metadata") or {}),
                **metadata_source,
            }

        metadata = self._normalize_metadata(metadata_source, graph_name, version)
        structure = self._build_structure_from_nodes(node_docs)

        return {
            "metadata": metadata,
            "structure": structure,
        }

    def save_graph(
        self,
        graph_name: str,
        data: Dict[str, Any],
        mutation_type: str,
        mutation_payload: Optional[Dict[str, Any]] = None,
        actor: Optional[str] = None,
        base_version: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Save graph state to Firestore and append mutation log entry."""
        graph_ref = self._graph_ref(graph_name)

        snapshot = graph_ref.get()
        graph_data = snapshot.to_dict() or {}
        try:
            current_version = int(graph_data.get("version", 0))
        except Exception:
            current_version = 0

        if base_version is not None and base_version != current_version:
            raise ValueError(
                f"Version mismatch for graph '{graph_name}'. "
                f"Expected {base_version}, current version is {current_version}."
            )

        next_version = current_version + 1
        metadata = (data or {}).get("metadata") or {}
        structure = (data or {}).get("structure") or {}

        nodes, edges = self._flatten_structure(structure)

        nodes_by_id: Dict[str, Dict[str, Any]] = {}
        for node in nodes:
            node_copy = dict(node)
            node_copy["version"] = next_version
            nodes_by_id[self._path_doc_id(node["path"])] = node_copy

        edges_by_id: Dict[str, Dict[str, Any]] = {}
        for edge in edges:
            edge_copy = dict(edge)
            edge_copy["version"] = next_version
            edge_doc_id = self._path_doc_id(edge["child_path"])
            edges_by_id[edge_doc_id] = edge_copy

        graph_ref.set(
            {
                "name": graph_name,
                "title": metadata.get("title") or graph_name.replace("_", " ").title(),
                "description": metadata.get("description") or "",
                "version": next_version,
                "node_count": len(nodes),
                "edge_count": len(edges),
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

        self._replace_collection(graph_ref.collection(self.NODES_COLLECTION), nodes_by_id)
        self._replace_collection(graph_ref.collection(self.EDGES_COLLECTION), edges_by_id)

        graph_ref.collection(self.MUTATIONS_COLLECTION).document().set(
            {
                "version": next_version,
                "type": mutation_type,
                "payload": mutation_payload or {},
                "actor": actor or "api",
                "node_count": len(nodes),
                "edge_count": len(edges),
                "created_at": firestore.SERVER_TIMESTAMP,
            }
        )

        if self.write_snapshots:
            graph_ref.collection(self.SNAPSHOTS_COLLECTION).document(str(next_version)).set(
                {
                    "version": next_version,
                    "data": data,
                    "created_at": firestore.SERVER_TIMESTAMP,
                }
            )

        return {
            "graph": graph_name,
            "version": next_version,
            "node_count": len(nodes),
            "edge_count": len(edges),
        }

    def get_mutations(self, graph_name: str, since_version: int = 0, limit: int = 200) -> List[Dict[str, Any]]:
        """Return mutation log entries after a version."""
        graph_ref = self._graph_ref(graph_name)
        query = (
            graph_ref.collection(self.MUTATIONS_COLLECTION)
            .where("version", ">", int(since_version))
            .order_by("version")
            .limit(max(1, min(int(limit), 500)))
        )

        entries: List[Dict[str, Any]] = []
        for doc in query.stream():
            payload = doc.to_dict() or {}
            payload["id"] = doc.id
            payload["created_at"] = self._timestamp_to_iso(payload.get("created_at"))
            entries.append(payload)
        return entries
