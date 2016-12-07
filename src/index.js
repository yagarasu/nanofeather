var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

var program = new Uint16Array([
  
]);

cpu.loadProgram(program);
//cpu.run();
