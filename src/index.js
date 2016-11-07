var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

var program = new Uint8Array([
  0x00
]);

cpu.loadProgram(program);
cpu.run();
