var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

// cpu.memory.writeReg(0x0, 0x10);
// cpu.memory.writeReg(0x1, 0x10);

for (var i = 0xF6E0; i < 0xFA00; i += 2) {
  cpu.memory.writeMem(i, 0x2);
}

cpu.screen.render();

var program = new Uint8Array([
  0  // HLT
]);

cpu.loadProgram(program);
// cpu.run();
