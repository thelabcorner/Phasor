import {mkdirSync,writeFileSync} from "node:fs";
import {DOMParser,XMLSerializer} from "@xmldom/xmldom";
import {compileTesseractSvg} from "../dist/procedural/tesseract.js";
const generated=compileTesseractSvg({periodMs:4800,tolerancePx:.24,decimalDigits:3});
const doc=new DOMParser().parseFromString(generated.svg,"image/svg+xml");
const animated=doc.getElementsByTagName("path").item(0);
if(!animated||!animated.getElementsByTagName("animate").length)throw Error("Expected real animated path");
animated.setAttribute("stroke","#38bdf8");
animated.setAttribute("stroke-width","1.65");
animated.setAttribute("stroke-opacity","0.90");
const wireframe=new XMLSerializer().serializeToString(animated).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,"");
const grid=Array.from({length:17},(_,i)=>{
  const x=640+i*34;
  return '<line x1="'+x+'" y1="30" x2="'+x+'" y2="416" stroke="#27272a" stroke-width=".65"/>';
}).join("");
const wave=Array.from({length:28},(_,i)=>{
  const x=58+i*16,y=382+9*Math.sin(i*.38);
  const fill=i%5===0?"#38bdf8":"#3f3f46",opacity=i%5===0?".90":".65";
  return '<rect x="'+x+'" y="'+y.toFixed(2)+'" width="9" height="1.3" fill="'+fill+'" opacity="'+opacity+'"/>';
}).join("");
const marks=Array.from({length:24},(_,i)=>{
 const angle=i*Math.PI/12,cx=947,cy=219,r1=i%6===0?193:200,r2=206;
 return '<line x1="'+(cx+Math.cos(angle)*r1).toFixed(2)+'" y1="'+(cy+Math.sin(angle)*r1).toFixed(2)+'" x2="'+(cx+Math.cos(angle)*r2).toFixed(2)+'" y2="'+(cy+Math.sin(angle)*r2).toFixed(2)+'" stroke="'+(i%6===0?"#64748b":"#3f3f46")+'" stroke-width="'+(i%6===0?1.7:1)+'"/>';
}).join("");
const svg=[
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 450" role="img" aria-labelledby="title description">',
'<title id="title">Phasor, a compiler for motion</title>',
'<desc id="description">A precise rotating four-dimensional tesseract, rendered as a self-contained SVG animation created by Phasor. No JavaScript is required for playback.</desc>',
'<rect width="1200" height="450" rx="15" fill="#09090b"/>',
'<rect x=".5" y=".5" width="1199" height="449" rx="14.5" fill="none" stroke="#27272a"/>',
'<clipPath id="rightClip"><rect x="616" y="16" width="567" height="418"/></clipPath>',
'<g opacity=".36" clip-path="url(#rightClip)">',grid,
'<line x1="638" y1="100" x2="1181" y2="100" stroke="#27272a"/>',
'<line x1="638" y1="219" x2="1181" y2="219" stroke="#27272a"/>',
'<line x1="638" y1="338" x2="1181" y2="338" stroke="#27272a"/>',
'</g>',
'<g clip-path="url(#rightClip)">',
'<circle cx="947" cy="219" r="206" fill="none" stroke="#27272a" stroke-width=".7"/>',
'<circle cx="947" cy="219" r="183" fill="none" stroke="#334155" stroke-width=".9" stroke-dasharray="2 12"/>',
'<circle cx="947" cy="219" r="147" fill="none" stroke="#27272a" stroke-width=".6" opacity=".85"/>',
marks,
'<ellipse cx="947" cy="219" rx="217" ry="81" fill="none" stroke="#164e63" stroke-width="1" stroke-dasharray="7 11" opacity=".7" transform="rotate(-24 947 219)">',
'<animateTransform attributeName="transform" type="rotate" from="-24 947 219" to="336 947 219" dur="24s" repeatCount="indefinite"/>',
'</ellipse>',
'<g transform="translate(673 -55) scale(1.07)">',wireframe,'</g>',
'<circle cx="947" cy="219" r="3.2" fill="#e0f2fe"/>',
'<circle cx="947" cy="219" r="12" fill="none" stroke="#38bdf8" stroke-opacity=".33"/>',
'<circle r="3" fill="#f8fafc"><animateMotion dur="9.6s" repeatCount="indefinite" path="M 1153 219 A 206 206 0 1 1 741 219 A 206 206 0 1 1 1153 219"/></circle>',
'</g>',
'<g font-family="Inter,Segoe UI,Arial,sans-serif">',
'<rect x="56" y="52" width="8" height="8" rx="1.3" fill="#38bdf8"/>',
'<text x="79" y="60" font-size="15" fill="#a1a1aa" letter-spacing="3">MOTION COMPILER</text>',
'<text x="58" y="204" font-size="104" font-weight="780" letter-spacing="-5" fill="#fafafa">PHASOR</text>',
'<rect x="58" y="237" width="58" height="3.2" rx="1" fill="#38bdf8"/>',
'<rect x="126" y="237" width="18" height="3.2" rx="1" fill="#3f3f46"/>',
'<text x="57" y="280" font-size="23" font-weight="450" fill="#e4e4e7">Compile motion.</text>',
'<text x="57" y="311" font-size="23" font-weight="450" fill="#a1a1aa">Preserve fidelity.</text>',
'<text x="58" y="358" font-size="12" letter-spacing="2.8" fill="#71717a">WEB ANIMATIONS API  /  SVG</text>',
wave,
'<text x="58" y="417" font-size="11" letter-spacing="2.7" fill="#71717a">DECLARATIVE  ·  SCRIPTLESS  ·  PORTABLE</text>',
'<text x="1144" y="417" text-anchor="end" font-size="12" fill="#71717a" letter-spacing="2">4D / 32 EDGES</text>',
'</g>',
'</svg>'
].join("");
mkdirSync("assets",{recursive:true});
writeFileSync("assets/phasor-hero.svg",svg);
console.log(JSON.stringify({bytes:new TextEncoder().encode(svg).length,proceduralKeyframes:generated.report.outputKeyframes,hasSMIL:svg.includes("<animate ")}));
