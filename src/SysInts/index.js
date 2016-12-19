module.exports = function (memory, PC, SP) {
  var cmd = memory.readReg(0x0); // Read A
  switch (cmd) {
    // console.log
    case 0x0:
      var dataPointer = memory.readReg(20); // Read X
      var char = memory.readMem(dataPointer++); // Read [X]
      var charS = this.screen.charmap[char];
      var str = '';
      var i = 0;
      // Look for null terminator
      while (char !== 0x0 && i < 20) {
        str += charS;
        char = memory.readMem(dataPointer++);
        charS = this.screen.charmap[char];
        i++;
      }
      // Apply function
      console.log(str);
      break;
  }
};