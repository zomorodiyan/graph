import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'

const svgRaw = readFileSync('./public/icon-colored.svg', 'utf-8')
const innerContent = svgRaw.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

// Dark background + 12.5-unit padding each side so gem sits in the 80% maskable safe zone
function buildSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12.5 -12.5 125 125" width="${size}" height="${size}">
  <rect x="-12.5" y="-12.5" width="125" height="125" fill="#1a1a2e"/>
  ${innerContent}
</svg>`
}

for (const size of [192, 512]) {
  const resvg = new Resvg(buildSvg(size), { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(`./public/icon-${size}.png`, png)
  console.log(`wrote public/icon-${size}.png`)
}
