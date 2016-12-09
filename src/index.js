var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

// cpu.memory.writeReg(0x0, 0x10);
// cpu.memory.writeReg(0x1, 0x10);

function randomIntFromInterval(min,max) { return Math.floor(Math.random()*(max-min+1)+min); }

for (var i = 0xF6E0; i < 0xFA00; i++) {
  var st = randomIntFromInterval(0x1,0x3),
      ch = randomIntFromInterval(0x1,0x39),
      char = (st << 6) + ch;
  cpu.memory.writeMem(i, char);
}
console.log('====== RENDER =====');
cpu.screen.render();

var program = new Uint8Array([
  0  // HLT
]);

cpu.loadProgram(program);
// cpu.run();
