// Sample graphs offered to new users via the "New Graph" card's left zone.
// `structure` is the same markdown-heading text used by clipboard copy/paste:
//   - "#"-depth headings are items; nesting depth = number of "#"s
//   - a heading's trailing "(YYYY-MM-DD)" is its date, trailing "#word" tokens
//     are its tags (see serializeStructure/parseMarkdownStructure)
//   - plain text under a heading is that item's context note
//   - templates author dates as "(+Nd)"/"(-Nd)" offsets (days from
//     instantiation, negative for already-overdue samples) so they never read
//     as stale; resolveTemplateDates resolves them to real YYYY-MM-DD dates
// Each template flexes the features differently to suit its domain.

export interface GraphTemplate {
  name: string          // url-safe base name (deduped at create time)
  displayName: string
  description: string
  structure: string
}

// Replaces a heading's "(+Nd)"/"(-Nd)" date offset with a real "(YYYY-MM-DD)",
// N days from `now` (today by default). Templates author dates as offsets so
// they never read as stale/overdue no matter when a user creates the sample graph.
export function resolveTemplateDates(structure: string, now: Date = new Date()): string {
  return structure.replace(/\(([+-]\d+)d\)/g, (_match, offset: string) => {
    const d = new Date(now)
    d.setDate(d.getDate() + Number(offset))
    return `(${d.toISOString().slice(0, 10)})`
  })
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    name: 'career',
    displayName: 'Career',
    description: 'Research, advising, growth',
    structure: `# Projects
## Process Simulation (+67d)
Parameters drive part quality

## Multi-Material
Interface behavior, dissimilar materials

## Digital Twin
Sensor data feeds defect predictions

# Advising
## Advisor Meeting (+0d) #recurring
Bring blockers, not status

## Lab Meeting

## Committee
### Qualifying Exam Feedback (+36d)
Feeds the candidacy defense

# Outreach
## Grant Proposal (+22d)
### Problem Statement

### Draft Narrative
Get advisor feedback first

### Budget Justification

## Conference Talk #travel

# Goals
## Publications
### Laser Interaction (+67d)
Pick venue before drafting
#### Checkpoint 1 (+5d)

#### Checkpoint 2 (+36d)

#### Checkpoint 3 (+67d)

### Multi-Material Simulation (+67d)
#### Checkpoint 1 (+5d)

#### Checkpoint 2 (+36d)

#### Checkpoint 3 (+67d)

## Candidacy Exam (+189d)
Track committee feedback

## Internship
No citizenship requirement needed

## Next Position
### Postdoc

### Research Scientist #someday
Start search a year out`,
  },
  {
    name: 'personal',
    displayName: 'Personal',
    description: 'People, health, home, downtime',
    structure: `# People
## Family
### Parents
Call every Sunday

### Siblings
#### Sister
Birthday — Mar 12

#### Brother

## Friends
### Close
#### Alex

#### Sam

### College

### Work

## Nurture
### Reach Out
It's been almost a year

### Birthdays

### Thank Yous

# Practice
## Skills
### Japanese
#### Section 1
##### Lessons 1-5
Order Food, Describe People, Introduce Yourself, Order Food and Drink, Talk About Countries

##### Lessons 6-9
Ask for Directions, Describe Belongings, Talk About Neighbors, Tell Time

#### Section 2
##### Lessons 1-5
Get Help When Traveling, Get to Know People, Describe Your Family, Talk About Hobbies, Describe Eating Habits

##### Lessons 6-10
Shop for Clothes, Order Food and Drink, Use Present Tense Verbs, Get Around a Station, Describe Your Routine

##### Lessons 11-15
Talk About Interests, Describe Your Home, Take Public Transit, Use Na-Adjectives, Get Emergency Help

##### Lessons 16-20
Talk About Weather, Discuss Chores, Say What You Want to Do, Discuss a Family Visit, Order Pastries

##### Lessons 21-25
Use Negative Verbs, Discuss Classes, Talk About Jobs, Get Around a Theme Park, Discuss Media

##### Lessons 26-28
Communication at Work, Discuss Seasonal Events, Talk About Date Plans

#### Speaking
##### Weekly Tutor (+2d)

### Chess
Tactics puzzles most days

## Queue
### Systems Design

### Photography

### Surfing

### Redwoods Trip
Coming target

## Output
### Notes

### Blog Posts

# Health
## Fitness
### Cardio
#### Run
10 min

### Mobility
#### Bird Dog

#### Dead Bug

### Knee
#### Terminal Knee Extension

#### Step-Ups

#### Wall Sit

### Shoulder
#### Face Pulls

#### Band Pull-Aparts

#### Scapular Push-Ups

### General
#### Squat

#### Deadlift
1x5 @ 120kg

#### Bench Press
3x5 @ 80kg, then deload

## Nutrition
### Hydration
Target 2.5L per day

### Calories
Target ~2325 kcal per day (155lb x 15 kcal/lb)
#### Breakfast
~580 kcal

#### Lunch
~815 kcal

#### Dinner
~700 kcal

#### Snacks
~230 kcal

### Protein
Target ~124g per day (155lb x 0.8g/lb)
#### Breakfast
~31g

#### Lunch
~43g

#### Dinner
~37g

#### Snacks
~13g

### Fiber
Target ~30g per day

### Sugar & Processed Food
Keep added sugar under 30g per day

## Recovery
### Sleep
7-8 hours, consistent schedule

## Metrics
### Weight

### Bloodwork (+144d)

# Chores
## Bedroom
### Clean

### Laundry

## Bathroom
### Clean

### Bathe

## Kitchen
### Clean

### Dishes

### Meal Prep
Sundays, grains and roast veg

## Groceries
### Produce
Bok choy for stir fry

### Pantry
Grains for batch cook
#### Rice

#### Potato

#### Onion #restock
Out — restock

#### Oil

#### Spices

#### Bread

#### Milk

#### Sugar

#### Yogurt

#### Fruits

#### Vegetables #restock
Out — restock

#### Lemons #restock
Out — restock

#### Eggs

#### Walnuts

### Proteins
Tofu for stir fry

### Freezer Meals

# Kitchen
## Recipes
### Weeknight
#### Stir Fry
20 minutes, one pan

#### Pasta Primavera

### Breakfast
#### Bread, Cheese, Walnuts or Vegetables

#### Sweetened Tea

#### Boiled Eggs

### Batch Meals
#### Tomato Stew
Freeze the rest

#### Vegetable Stew
Freeze the rest

#### Lasagna
Freeze the rest

### To Try
#### Thai Green Curry

#### Shakshuka

# Finances
## Fixed Costs
### Rent
Paid, my share of total — $950/mo

### Insurance
Share of total — $55/mo

### Subscriptions
Share of total — $30/mo

## Budgeted
### Groceries
$450/mo

### Dining Out
$130/mo

### Transport
$150/mo

### Clothes

### Household Supplies
Cleaning, bathroom — $45/mo

### Office Supplies
Pens, paper, small gear — $20/mo

### Personal Care
$70/mo

### Health/Medical
Copays, prescriptions — $100/mo

## Investments
### Roth IRA
Monthly contribution — $50/mo

### Emergency Fund
Monthly contribution — lawyer, income gaps, health, gifts — $250/mo

## Goals
### Pay Off Loan (+1000d)

# Leisure
## Reading
### Sci-Fi

## Watchlist
### Anime
#### Watching
##### One Piece
Egghead arc, no spoilers

##### Attack on Titan
Rewatching before final chapter

#### Queue
##### Frieren

### Movies
#### Oppenheimer
Recommended by Sam

### Shows
#### Severance

### Games
#### Hollow Knight: Silksong

#### Minecraft

### Documentaries
#### Planet Earth

# Daily Rhythm
## Wake 6am

## Clean

## Breakfast

## Commute

## Workout
Alternate run and lift days

## Plan Day
### Top 3 Tasks

## Focus
Phone in another room

## Lunch

## Focus

## Commute

## Cook
Wed, Fri

## Family Time

## Wind Down
### Read
30 min, no screens

### Journal
One good, one hard

## Sleep by 11pm

## Weekend
### Meal Prep

### Long Walk

### Grocery Run
Restock pantry, produce for the week

### Review Budget
Check spend against Budgeted categories

# Admin
## Visa Status (+53d)
Renew before it expires

## ID Renewal

## Taxes (+279d)`,
  },
  {
    name: 'app-features',
    displayName: 'App Features',
    description: 'This app, mapped as a graph',
    structure: `# Graphs
## New Graph
Create one from scratch, or start from a template like this one.

## Templates
Starter samples — Career, Personal, and this App Features graph.

## Rename & Describe
Display name, description, and icon.

## Copy & Paste
Copy a graph's structure to the clipboard as markdown text, paste to create a new one.

## Delete

# Items
## Title

## Context
Free-text note shown under the title.

## Date
A single optional date — means whatever you want it to (due, scheduled, logged). No fraction, no rollup into a parent.

## Tags
Short labels, hash-colored, cutting across the tree independent of parent/child.

## Children
Nested sub-items, no depth limit.

# Navigation & Views
## Drill Down
Tap an item to make its children the new top level.

## Depth Cycling
Show 3 levels, 2 levels, or everything at once.

## View Mode
Default vs. Context — Context also shows each item's note.

## Minimal View
Hides date, tags, and notes — titles only.

## Facet View #planned
long-press the theme button to filter the current tree down to only items that have a chosen facet — keeps the same nested structure.

# Sync
## GitHub Token
A personal access token, gist scope only, connects the app to your data.

## Private Gist
Each graph is stored as its own private Gist.

## Sync Status
Per-graph indicator for up to date, syncing, or errored.

## Sync All
Push and pull every graph in one action.

# Editing & Interaction
## Inline Editors
Edit a graph's or an item's fields without leaving the page.

## Mobile Edit Sheet
A bottom sheet used instead of inline editing on touch devices.

## Context Menu
Right-click or long-press for Edit, New, Paste, Delete.

## Copy & Paste Items
Select an item (or several) to copy or delete via the bar that appears; paste under a specific item via its right-click menu.

## Drag Reorder
Reorders an item among its siblings by dragging.

### Multi-Level Drag #shipped
Level-2 and level-3 items can now be dragged among their own siblings too, each still carrying its own subitems along — including ones not currently visible at the active depth.

### Drag to Nest #shipped
Dropping an item on the body of another item (any level, any parent) makes it that item's child instead of reordering it — the top edge of a row still means "insert before" like ordinary reordering.

## Swipe & Long-Press
Touch shortcuts for common actions.

## Fields Simplified #shipped
Progress, checkpoints, and cost (and the "Time"/"Value" buttons that edited them) are gone — replaced by two flatter fields: Date (a single optional date, no fraction or rollup) and Tags (short labels, hash-colored, cutting across the tree). Nothing set on an item ever affects how its parent renders anymore.

## Mobile Interaction Rework #shipped
On mobile: tap does nothing now — swipe-left on an item navigates into it, swipe-right navigates up the tree (same action no matter where you swipe, item or empty background), long-press opens the editor directly (no menu step). The hardware back button also steps up one level instead of exiting the graph. Pinch-zoom still resizes text, but no longer shifts where the layout reflows. Desktop click/right-click are unchanged. Adding a sub-item to a specific existing item no longer has its own swipe shortcut — right-click it (or long-press on mobile) from its parent's list and choose New.

# Agent Access
## Access Guide
In-app instructions for connecting an AI agent to your graph data.

## Gist-Based API
Agents read and write the same Gist-backed structure the app itself uses.

## Conversational Agent #shipped
Bottom-anchored chat, Telegram-style — a toggle button on every view opens a panel with a message list and a textbox that shifts up above the on-screen keyboard when focused. Bring-your-own Anthropic API key, called directly from the browser (billed to the user, not this app). The agent has tools to look at, edit, and add items anywhere in the current graph — not just what's on screen — and edits show up live as it makes them. Deferred: fine-tuning how it talks about items (plain language vs. raw Markdown), voice input.

## Item Highlighting #shipped
A two-way "point at an item" channel alongside editing. User highlights an item — tap on mobile, Ctrl/Cmd+click on desktop — and it's included as context on the next message. The agent highlights back via its own tool, in a different color; both can apply to the same item at once. Ephemeral — not saved with the graph.

# Platform
## PWA Install
Installable as a standalone app.

## iOS Install Banner
Walks iOS users through Add to Home Screen.

## Theme
Light / dark toggle.

## Color Scheme
Accent color options.`,
  },
]
