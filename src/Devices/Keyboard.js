var Keyboard = function (cpu, device, bufferOffset, bufferLength) {

  var CHARMAP = [
        //  0    1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
  /* 0 */  null,'+','-','*','/','_','.',',',';','>','<','?','!','"','(',')',
  /* 1 */  '0' ,'1','2','3','4','5','6','7','8','9','=',':','[',']','{','}',
  /* 2 */  ' ' ,'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  /* 3 */  'P' ,'Q','R','S','T','U','V','W','X','Y','Z','@','#','$','%','&'
  ];

  
  var buffer = cpu.memory.getMap(bufferOffset, bufferLength);
  
  var kc2charmap = function (k) {
    var char = String.fromCharCode(k).toUpperCase();
    var idx = CHARMAP.findIndex(function (c) { return c === char});
    if (idx < 0) { return 0; } // Error, return null
    return idx;
  };
  
  document.addEventListener('keypress', function (e) {
    // Shift buffer to the right
    buffer.copyWithin(1, 0);
    // Set new byte
    buffer[0x0] = kc2charmap(e.which);
  });
  
  cpu.assignInterrupt(0, function (memory, PC, SP) {
    var cmd = memory.readReg(0x0); // Read A
    switch (cmd) {
      
      // Write current keypress on reg D
      case 0x0:
        memory.writeReg(0x3, buffer[0x0]);
        return cpu.iret();
        
      // Move buffer until NULL into X
      // Length of written chars in D
      // ORed with C
      case 0x1:
        var X = memory.readReg(20);
        var C = memory.readReg(0x2);
        var o = 0;
        while (buffer[o] !== 0x0) {
          memory.writeMem(X + o, buffer[o] | C);
          buffer[o] = 0;
          o++;
        }
        memory.writeReg(3, o);
        return cpu.iret();
        
      // Clean current buffer until NULL.
      // Cleaned up bytes in D
      case 0x2:
        var o = 0;
        while (buffer[o] !== 0x0) {
          buffer[o] = 0;
          o++;
        }
        memory.writeReg(3, o);
        return cpu.iret();
        
      // Copy a byte from buffer[B] to X
      // ORed with C
      case 0x3:
        var X = memory.readReg(20);
        var B = memory.readReg(0x1);
        var C = memory.readReg(0x2);
        var char = buffer[B];
        memory.writeMem(X, (char | C));
        return cpu.iret();
        
      // Force buffer shift
      case 0x4:
        buffer.copyWithin(1, 0);
        buffer[0x0] = 0;
        return cpu.iret();

      default:
        throw new Error('Unknown INT code ' + cmd);
    }
  });
  
};

module.exports = Keyboard;