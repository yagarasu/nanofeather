var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

var program = new Uint8Array([
  0b11000111, 0b00000101,
  0b11001111, 0b00001010,
]);

cpu.loadProgram(program);
cpu.run();
