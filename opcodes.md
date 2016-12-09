# Op code design

## Commands 

- HLT - Halt program                                1

- ADD rr, (rr|mm|dd) - Add                          3
- SUB rr, (rr|mm|dd) - Substract                    3
- MUL rr, (rr|mm|dd) - Multiply *                   3
- DIV rr, (rr|mm|dd) - Divide *                     3
- INC (rr|mm) - Increment                           2
- DEC (rr|mm) - Decrement                           2
- AND rr, (rr|mm|dd) - Logical and                  3
- OR  rr, (rr|mm|dd) - Logical or                   3
- XOR rr, (rr|mm|dd) - Logical exclusive or         3
- SHL (rr|mm) - Shift left                          2
- SHR (rr|mm) - Shift right                         2
                                                    30

- MOV (rr|mm), (rr|mm|cc) - Move data               6
- PUSH (rr|mm|cc) - Push data into stack            3
- POP (rr) - Pop data from stack                    1
                                                    10

- JMP (rr|mm|cc) - jump                             3
- JE  (rr|mm|cc) - jump if equal                    3
- JNE (rr|mm|cc) - jump if not equal                3
- JG  (rr|mm|cc) - jump if greater than             3
- JGE (rr|mm|cc) - jump if greater than or equal    3
- JL  (rr|mm|cc) - jump if lesser than              3
- JLE (rr|mm|cc) - jump if lesser than or equal     3
- CMP (rr|mm), (rr|mm|cc) - compare                 6
- CALL (rr|mm|cc) - call subroutine                 3
- RET - return from subroutine                      1
