// Generates public/sample.pdf — a tiny textbook used by the "Try the sample" button.
// Dependency-free: writes PDF objects by hand. Run: node scripts/make-sample-pdf.mjs
import { writeFileSync } from "node:fs";

const book = [
  ["title", "Forces and Motion"],
  ["p", "A short introduction to classical mechanics for curious students."],
  ["h1", "Chapter 1: Describing Motion"],
  ["p", "Motion is everywhere around us, from a rolling ball to the planets circling the Sun. To study motion we must first measure where an object is and how quickly its position changes. Physicists describe motion using a small set of precise quantities."],
  ["h2", "Speed and Velocity"],
  ["p", "Speed is the distance an object travels in a given amount of time. Velocity is the speed of an object together with its direction of travel. Two cars can have the same speed but different velocity if they drive in opposite directions. This difference is important because direction changes the result of many calculations."],
  ["f", "v = d / t"],
  ["p", "For example, a cyclist who covers 100 meters in 20 seconds has an average speed of 5 meters per second. If the cyclist then turns around, the speed stays the same but the velocity reverses."],
  ["h2", "Acceleration"],
  ["p", "Acceleration is the rate at which velocity changes over time. An object accelerates when it speeds up, slows down, or changes direction. Therefore a car moving around a bend at constant speed is still accelerating, because its direction keeps changing."],
  ["f", "a = (v - u) / t"],
  ["h1", "Chapter 2: Newton's Laws"],
  ["p", "Isaac Newton explained motion with three laws that connect forces to the way objects move. These laws remain the foundation of engineering, from bridges to rockets."],
  ["h2", "Force and Inertia"],
  ["p", "A force is a push or a pull that acts on an object. Inertia is the tendency of an object to resist any change in its motion. The first law states that an object stays at rest or keeps moving in a straight line unless an unbalanced force acts on it. Heavier objects have more inertia, which is why a loaded truck is harder to stop than a bicycle."],
  ["h2", "The Second Law"],
  ["p", "The second law tells us exactly how much an object accelerates. The acceleration depends on the net force and on the mass of the object. A larger force causes a larger acceleration, while a larger mass leads to a smaller one."],
  ["f", "F = m × a"],
  ["p", "For example, pushing a 10 kilogram cart with a force of 20 newtons gives it an acceleration of 2 meters per second squared. Doubling the force doubles the acceleration."],
  ["p", "To solve a force problem, follow these steps:"],
  ["l", "1. Draw the object and every force acting on it."],
  ["l", "2. Add the forces to find the net force."],
  ["l", "3. Divide the net force by the mass to get the acceleration."],
  ["l", "4. Check that the direction of your answer makes sense."],
  ["h2", "Action and Reaction"],
  ["p", "The third law states that every action has an equal and opposite reaction. When a swimmer pushes water backward, the water pushes the swimmer forward. Rockets work the same way, because hot gas thrown downward lifts the rocket upward."],
  ["h1", "Chapter 3: Energy"],
  ["p", "Energy is the ability to do work. It is never created or destroyed, but it constantly changes from one form into another. This principle is called the conservation of energy, and it is one of the most important ideas in science."],
  ["h2", "Kinetic and Potential Energy"],
  ["p", "Kinetic energy is the energy an object has because of its motion. Potential energy is the energy stored in an object because of its position. A book on a high shelf has potential energy, which becomes kinetic energy as the book falls."],
  ["f", "KE = 1/2 m v^2"],
  ["f", "PE = m g h"],
  ["p", "For example, a roller coaster at the top of a hill has mostly potential energy. As it races down, that energy transforms into kinetic energy and the cars reach their highest speed at the bottom."],
  ["h2", "Summary"],
  ["p", "Motion is described by speed, velocity, and acceleration. Forces cause acceleration, and the second law links force, mass, and acceleration together. Energy changes form but the total amount always stays the same."],
];

const W = 612, H = 792, M = 72;
const esc = (s) => s.replace(/[\\()]/g, "\\$&").replace(/×/g, "\\327");
const wrap = (text, max) => {
  const lines = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
};

const pages = [];
let ops = [], y = H - M;
const newPage = () => { if (ops.length) pages.push(ops.join("\n")); ops = []; y = H - M; };
const put = (text, font, size, gapBefore, x = M) => {
  y -= gapBefore;
  if (y < M) { newPage(); }
  ops.push(`BT /${font} ${size} Tf ${x} ${y.toFixed(1)} Td (${esc(text)}) Tj ET`);
  y -= size * 1.35;
};

for (const [kind, text] of book) {
  if (kind === "title") put(text, "F2", 30, 60);
  else if (kind === "h1") { newPage(); put(text, "F2", 22, 10); }
  else if (kind === "h2") { if (y < M + 90) newPage(); put(text, "F2", 15, 14); }
  else if (kind === "f") put(text, "F1", 12, 6, M + 40);
  else if (kind === "l") put(text, "F1", 11.5, 2, M + 14);
  else wrap(text, 88).forEach((l, i) => put(l, "F1", 11.5, i === 0 ? 8 : 0));
}
newPage();

const objs = [];
const add = (body) => { objs.push(body); return objs.length; };
add("<< /Type /Catalog /Pages 2 0 R >>");
add(""); // pages placeholder
add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
const kids = pages.map((content) => {
  const c = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`);
});
objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

let pdf = "%PDF-1.4\n";
const offsets = objs.map((body, i) => {
  const at = Buffer.byteLength(pdf, "latin1");
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  return at;
});
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

writeFileSync(new URL("../public/sample.pdf", import.meta.url), Buffer.from(pdf, "latin1"));
console.log(`sample.pdf written: ${kids.length} pages`);
