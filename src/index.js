var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

var program = new Uint8Array([
  0b11000111, 0b00000101, // MOV A, 5
  0b11001111, 0b00001010, // MOV B, 10
  0b11100111, 0b00001111, // MOV [0xFF], A
  0b10101111, 0b00000010, // ADD A, 0x2
  0b00010000  // NOT A
]);

cpu.loadProgram(program);
cpu.run();
