var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

var program = new Uint8Array([
  // 0b11000111, 0b00000101, // MOV A, 5
  // 0b11001111, 0b00001010, // MOV B, 10
  // 0b11100111, 0b00001111, // MOV [0xFF], A
  // 0b10100111, 0b00000010, // ADD A, 0x2
  // //0b00010000,  // NOT A
  // 0b00001110, 0b00000100  // JMP 0x4
  
  0b11000111, 0b00000101, // MOV A, 5
  0b01100111, 0b00000111, // CMP A, 7
  0b00001001, 0b00000111, // JNE 0x7
  0b00000000, // HLT
  0b11001111, 0b00001111, // MOV B, 0xF
  0b00000000, // HLT
]);

cpu.loadProgram(program);
cpu.run();
