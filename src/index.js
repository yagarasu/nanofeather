var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

// cpu.memory.writeReg(0b00000101, 0x3C);
// cpu.memory.writeReg(0b00000100, 0xA5);
cpu.memory.writeReg(0x1, 0x3);
// cpu.memory.writeMem(0x10, 20);
// cpu.memory.writeMem(257, 40);

var program = new Uint8Array([
  
  47, 1,
  48, 1,
  49, 0, 2,
  50, 10,
  
  51, 0,
  51, 2,
  51, 3,
  51, 4,
  
  0b00000000
]);

cpu.loadProgram(program);
cpu.run();
