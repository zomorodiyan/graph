import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'

const svgRaw = readFileSync('./public/icon.svg', 'utf-8')
const innerContent = svgRaw.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

// Transparent background, 12.5-unit padding each side for maskable safe zone
function buildSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-22 -22 144 144" width="${size}" height="${size}">
  ${innerContent}
</svg>`
}

for (const size of [192, 512]) {
  const resvg = new Resvg(buildSvg(size), { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(`./public/icon-${size}.png`, png)
  console.log(`wrote public/icon-${size}.png`)
}
