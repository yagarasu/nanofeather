var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

cpu.memory.writeReg(0x0, 123);
cpu.memory.writeReg(0x1, 1);

var program = new Uint8Array([
  0b00000001, // ADD r, r
  0b00000000,
  0b00000001,
  // 0b00000010,
  // 0b00000011,
  // 0b00000100,
  0b00000000
]);

cpu.loadProgram(program);
cpu.run();
