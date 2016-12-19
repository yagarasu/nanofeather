var parser = require('./parser');

var CHARMAP = [
        //  0    1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
  /* 0 */  null,'+','-','*','/','_','.',',',';','>','<','?','!','"','(',')',
  /* 1 */  '0' ,'1','2','3','4','5','6','7','8','9','=',':','[',']','{','}',
  /* 2 */  ' ' ,'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  /* 3 */  'P' ,'Q','R','S','T','U','V','W','X','Y','Z','@','#','$','%','&'
  ];

function compile (code) {
  var prog = code.replace(/;[^\n\r]+/g, ''); // Remove comments
  prog = prog.replace(/^[\n\r]/gm, ''); // Remove empty lines
  prog = prog.replace(/(?:^)[ \t]+|[ \t]+(?=$)/gm, ''); // Trim
  
  var labels = {};
  var bytecode = [];
  
  try {
    var comp = parser.parse(prog);
    for (var i = 0; i < comp.length; i++) {
      var label = comp[i].label,
          instr = comp[i].instr;
      if (label !== null) {
        labels[label] = bytecode.length;
      }
      if (instr.opcode < 0) {
        // Compiler op
        switch (instr.mnem) {
          case 'DB':
            if (typeof instr.args === 'string') {
              for (var s = 0; s < instr.args.length; s++) {
                var c = instr.args.charAt(s).toUpperCase(),
                    cb = CHARMAP.indexOf(c);
                if (cb > -1) {
                  bytecode.push(cb);
                }
              }
            } else {
              bytecode.push(instr.args);
            }
            break;
          case 'DUP':
            // Not implemented yet
            break;
        }
      } else {
        bytecode.push(instr.opcode);
        var types = instr.mnem.match(/(?:_)[A-Z]+/g);
        var args = Array.isArray(instr.args) ? instr.args : [instr.args];
        for (var j = 0; j < args.length; j++) {
          if (args[j] === null) { break; }
          pushArg(types[j], args[j], bytecode);
        }
      }
    }
    
    // Replace labels
    for (var b = 0; b < bytecode.length; b++) {
      var cb = bytecode[b];
      if (typeof cb === 'string') {
        var addr = labels[cb],
          addr1 = (addr & 0xFF00) >> 8, addr2 = (addr & 0xFF);
        bytecode[b] = addr1;
        bytecode[b+1] = addr2;
        b++;
      }
    }
  } catch (e) {
    console.error(e);
  }
  
  return {
    bytecode: Uint8Array.from(bytecode),
    array: bytecode,
    labels: labels
  };
}

function pushArg(type, value, bc) {
  switch (type) {
    case '_R':
    case '_RA':
      bc.push(value);
      break;
    case '_A':
    case '_CA':
      if (typeof value === 'string') {
        bc.push(value);
        bc.push(value);
      } else {
        var v1 = (value & 0xFF00) >> 8, v2 = (value & 0xFF);
        bc.push(v1);
        bc.push(v2);
      }
      break;
    case '_C':
      bc.push(value);
      break;
  }
}

module.exports = compile;