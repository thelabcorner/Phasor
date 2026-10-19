import {compileSvgAnimation} from "../dist/index.js";
import {writeFileSync} from "node:fs";
const result=compileSvgAnimation({
  svg:`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">
  <rect width="320" height="120" fill="#f4f4f5"/>
  <circle id="ball" cx="30" cy="60" r="22" opacity="1" fill="#2563eb"/>
</svg>`,
  tracks:[{target:{svgId:"ball"},keyframes:[
    {offset:0,cx:30,opacity:1,easing:"ease-in-out"},
    {offset:.5,cx:290,opacity:.3,easing:"ease-in-out"},
    {offset:1,cx:30,opacity:1}
  ],timing:{duration:2400,iterations:Infinity,fill:"none"}}],
  options:{profile:"svg-image",mode:"exact-only"}
});
writeFileSync(new URL("./animated-circle.svg",import.meta.url),result.svg);
console.log(JSON.stringify(result.report,null,2));
