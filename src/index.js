var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

var program = new Uint8Array([
  // ADD test
  // 0b11000111, 0b00001000, // MOV A, 8
  // 0b10100111, 0b00001000, // ADD A, 8
  // 0b00000000 // HLT
  // // Flags should be on
  
  // JMP test
  0b11000111, 0b00000101, // MOV A, 5
  0b01100111, 0b00000001, // CMP A, 1
  0b00001101, 0b00000111, // JG 0x7
  0b00000000, // HLT
  0b11001111, 0b00001111, // MOV B, 0xF
  0b00000000, // HLT
]);

cpu.loadProgram(program);
cpu.run();
