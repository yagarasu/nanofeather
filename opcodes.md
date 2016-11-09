opcodes

Arg types
<const> - constant value
<reg> - register (constant address?)
<address> - address
<effective address of ref>

-- halt
HLT - Halt program
-- data
MOV - Move data from one point to other
PUSH - Push data into stack
POP - Pop data from stack
-- alu
ADD - Add
SUB - Substract
INC - Increment
DEC - Decrement
MUL - Multiply *
DIV - Divide *
AND - Logical and
OR - Logical or
XOR - Logical exclusive or
NOT - Negate (?)
NEG - 2s comp
SHL - Shift left
SHR - Shift right
-- flow
JMP - jump
JE - jump if equal
JNE - jump if not equal
JZ - jump if zero
JG - jump if greater than
JGE - jump if greater than or equal
JL - jump if lesser than
JLE - jump if lesser than or equal
CMP - compare
CALL - call subroutine
RET - return from subroutine


0000 0000 HLT - 0x00

1 byte instr (1 byte arg) iiir rmmm: aaaa aaaa

iii             rr          mmm:
000 - exp

001 - OR        00 A        000 A
010 - AND       01 B        001 B
011 - CMP       10 C        010 C
100 - SUB       11 D        011 D
101 - ADD                   100 [reg]
110 - MOV rr, mmm           101 [reg + offset]
111 - MOV mmm, rr           110 [const]
                            111 const

Expansion set
000i immm: aaaa aaaa

prefix          ii          mmm
000             00 - exp
                01 - JMP                <address>
                            000 JE
                            001 JNE
                            010 JL
                            011 JLE
                            100 JG
                            101 JGE
                            110 JMP
                            111 - not assigned
                10 - NOT    <same mmm as not exp>
                11 - not assigned


