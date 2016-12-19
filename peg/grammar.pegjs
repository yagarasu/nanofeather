/*
 * NFASM
 * ==========================
 */

{
  var regs = {
    A:0, B:1, C:2, D:3,
    XL:4, XH:5, YL:6, YH:7,
    X:20, Y:22
  };
  
  var opcodes = [
  'HLT',
  'ADD_R_R','ADD_R_RA','ADD_R_A','ADD_R_C',
  'SUB_R_R','SUB_R_RA','SUB_R_A','SUB_R_C',
  'MUL_R_R','MUL_R_RA','MUL_R_A','MUL_R_C',
  'DIV_R_R','DIV_R_RA','DIV_R_A','DIV_R_C',
  'INC_R','DEC_R',
  'AND_R_R','AND_R_RA','AND_R_A','AND_R_C',
  'OR_R_R','OR_R_RA','OR_R_A','OR_R_C',
  'XOR_R_R','XOR_R_RA','XOR_R_A','XOR_R_C',
  'SHL_R_R','SHL_R_RA','SHL_R_A','SHL_R_C',
  'SHR_R_R','SHR_R_RA','SHR_R_A','SHR_R_C',
  'MOV_R_R','MOV_R_RA','MOV_R_A','MOV_R_C',
  'MOV_RA_R','MOV_A_R','MOV_RA_C','MOV_A_C',
  'PUSH_R','PUSH_RA','PUSH_A','PUSH_C','POP_R',
  'JMP_RA','JMP_A','JMP_C',
  'JE_RA','JE_A','JE_C',
  'JNE_RA','JNE_A','JNE_C',
  'JG_RA','JG_A','JG_C',
  'JGE_RA','JGE_A','JGE_C',
  'JL_RA','JL_A','JL_C',
  'JLE_RA','JLE_A','JLE_C',
  'CMP_R_R','CMP_R_RA','CMP_R_A','CMP_R_C',
  'CALL_RA','CALL_A','CALL_C',
  'RET',
  'INT_C',
  'BRK',
  
  'ADD_R_CA','SUB_R_CA','MUL_R_CA','DIV_R_CA',
  'AND_R_CA','OR_R_CA','XOR_R_CA','SHL_R_CA','SHR_R_CA',
  'MOV_R_CA','MOV_CA_R','MOV_CA_C','CMP_R_CA',
  'PUSH_CA',
  'JMP_CA','JE_CA','JNE_CA','JG_CA','JGE_CA',
  'JL_CA','JLE_CA','CALL_CA'
];
  
  function buildInstr (mnem, args) {
  	return {
      opcode: opcodes.findIndex(function (o) { return o === mnem;}),
      mnem: mnem,
      args: args
    };
  }
}

Code "code"
  = h:Instr b:(NL Instr)* NL {
    var rest = b.map(function(i){return i[1];});
    return [h].concat(rest);
  }

Instr "instruction"
  = l:(Label _)? i:(TwoArgIns / OneArgIns / SingleIns / DataIns) {
    return {
      label: (l) ? l[0] : null,
      instr: i
    }
  }
  
DataIns "data instruction"
  = m:"DB" _ d:(Int/String) { return buildInstr(m, d); }
  / m:"DUP" _ n:Int _ "," _ d:(Int/String) { return buildInstr(m, [n, d]); }

TwoArgIns "two argument instruction"
  = m:"ADD" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"ADD" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"ADD" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"ADD" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"SUB" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"SUB" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"SUB" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"SUB" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"MUL" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"MUL" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"MUL" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"MUL" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"DIV" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"DIV" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"DIV" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"DIV" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"AND" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"AND" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"AND" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"AND" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"OR" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"OR" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"OR" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"OR" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"XOR" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"XOR" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"XOR" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"XOR" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"SHL" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"SHL" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"SHL" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"SHL" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"SHR" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"SHR" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"SHR" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"SHR" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"MOV" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"MOV" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"MOV" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"MOV" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"MOV" _ a1:RegAddr _ "," _ a2:Reg { return buildInstr(m + "_RA_R", [a1, a2]); }
  / m:"MOV" _ a1:ConstAddr _ "," _ a2:Reg { return buildInstr(m + "_A_R", [a1, a2]); }
  / m:"MOV" _ a1:RegAddr _ "," _ a2:Int { return buildInstr(m + "_RA_C", [a1, a2]); }
  / m:"MOV" _ a1:ConstAddr _ "," _ a2:Int { return buildInstr(m + "_A_C", [a1, a2]); }
  / m:"CMP" _ a1:Reg _ "," _ a2:Reg { return buildInstr(m + "_R_R", [a1, a2]); }
  / m:"CMP" _ a1:Reg _ "," _ a2:RegAddr { return buildInstr(m + "_R_RA", [a1, a2]); }
  / m:"CMP" _ a1:Reg _ "," _ a2:ConstAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"CMP" _ a1:Reg _ "," _ a2:Int { return buildInstr(m + "_R_C", [a1, a2]); }
  / m:"ADD" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"SUB" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"MUL" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"DIV" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"AND" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"OR" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"XOR" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"SHL" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"SHR" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"MOV" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"MOV" _ a1:LabelAddr _ "," _ a2:Reg { return buildInstr(m + "_A_R", [a1, a2]); }
  / m:"MOV" _ a1:LabelAddr _ "," _ a2:Int { return buildInstr(m + "_A_C", [a1, a2]); }
  / m:"CMP" _ a1:Reg _ "," _ a2:LabelAddr { return buildInstr(m + "_R_A", [a1, a2]); }
  / m:"ADD" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"SUB" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"MUL" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"DIV" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"AND" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"OR" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"XOR" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"SHL" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"SHR" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"MOV" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }
  / m:"MOV" _ a1:LabelRef _ "," _ a2:Reg { return buildInstr(m + "_CA_R", [a1, a2]); }
  / m:"MOV" _ a1:LabelRef _ "," _ a2:Int { return buildInstr(m + "_CA_C", [a1, a2]); }
  / m:"CMP" _ a1:Reg _ "," _ a2:LabelRef { return buildInstr(m + "_R_CA", [a1, a2]); }

OneArgIns "one argument instruction"
  = m:("INC"/"DEC") _ a:Reg { return buildInstr(m + '_R', a); }
  / m:"PUSH" _ a:Reg { return buildInstr(m + '_R', a); }
  / m:"PUSH" _ a:RegAddr { return buildInstr(m + '_RA', a); }
  / m:"PUSH" _ a:ConstAddr { return buildInstr(m + '_A', a); }
  / m:"PUSH" _ a:LabelRef { return buildInstr(m + '_CA', a); }
  / m:"PUSH" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"PUSH" _ a:Int { return buildInstr(m + '_C', a); }
  / m:"POP" _ a:Reg { return buildInstr(m + '_R', a); }
  / m:"JMP" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"JMP" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"JMP" _ a:LabelRef { return buildInstr(m + '_CA', a); }
  / m:"JMP" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"JMP" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"JE" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"JE" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"JE" _ a:LabelRef { return buildInstr(m + "_CA", a); }
  / m:"JE" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"JE" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"JNE" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"JNE" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"JNE" _ a:LabelRef { return buildInstr(m + "_CA", a); }
  / m:"JNE" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"JNE" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"JG" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"JG" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"JG" _ a:LabelRef { return buildInstr(m + "_CA", a); }
  / m:"JG" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"JG" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"JGE" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"JGE" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"JGE" _ a:LabelRef { return buildInstr(m + "_CA", a); }
  / m:"JGE" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"JGE" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"JL" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"JL" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"JL" _ a:LabelRef { return buildInstr(m + "_CA", a); }
  / m:"JL" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"JL" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"JLE" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"JLE" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"JLE" _ a:LabelRef { return buildInstr(m + "_CA", a); }
  / m:"JLE" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"JLE" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"CALL" _ a:RegAddr { return buildInstr(m + "_RA", a); }
  / m:"CALL" _ a:ConstAddr { return buildInstr(m + "_A", a); }
  / m:"CALL" _ a:LabelRef { return buildInstr(m + "_CA", a); }
  / m:"CALL" _ a:LabelAddr { return buildInstr(m + '_A', a); }
  / m:"CALL" _ a:Int { return buildInstr(m + "_C", a); }
  / m:"INT" _ a:Int { return buildInstr(m + "_C", a); }

SingleIns "single instruction"
  = m:("HLT"/"RET"/"BRK") { return buildInstr(m, null); }
  
LabelAddr "label address"
  = "[" _ a:LabelRef _ "]" { return a; }

ConstAddr "address"
  = "[" _ a:Int _  "]" { return a; }
  
RegAddr "register address"
  = "[" _ a:Reg _  "]" { return a; }

Reg "register"
  = [A-D] { return regs[text()]; }
  /([XY][HL]?) { return regs[text()]; }
  
LabelRef "label reference"
  = lh:[a-zA-Z._] l:([a-zA-Z0-9._]*) { return lh + l.join(''); }
 
Label "label"
  = l:LabelRef ":" { return l; }
  
String "string"
  = '"' s:[^"]* '"' { return s.join(''); }
  
Int "integer"
  = BinInt / HexInt / DecInt

BinInt "bin integer"
  = "0b" n:([01])+ { return parseInt(n.join(''), 2); }

HexInt "hex integer"
  = "0x" [0-9A-F]+ { return parseInt(text(), 16); }

DecInt "dec integer"
  = [0-9]+ { return parseInt(text(), 10); }

NL "new line"
  = [\n\r]*

_ "whitespace"
  = [ \t\n\r]*