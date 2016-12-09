var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

// cpu.memory.writeReg(0b00000101, 0x3C);
// cpu.memory.writeReg(0b00000100, 0xA5);
cpu.memory.writeReg(0x0, 0x10);
cpu.memory.writeReg(0x1, 0x10);
// cpu.memory.writeMem(0x10, 20);
// cpu.memory.writeMem(257, 40);

var program = new Uint8Array([
  
  42, 0, 0xFF,// MOV A, 0xFF
  79, 9, // CALL 0x9
  42, 1, 0xFF,// MOV B, 0xFF
  0, // HLT
  
  42, 0, 0x0F,// MOV A, 0x0F
  80,
  
  0  // HLT
]);

cpu.loadProgram(program);
cpu.run();
