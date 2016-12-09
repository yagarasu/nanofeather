# CPU

## Memory
    - Registers
    - 64k memory for program, data and stack

Register based 8 bit machine.

4 GP 8 bit registers (A, B, C, D)
2 GP 16 bit registers (X, Y)
    8 bit words addressable as rH / rL

```
     _______________________
    |           X           |
    +-----------------------+
    | 0000 0000   0000 0000 |
    +-----------------------+
    |     XH    |     XL    |
    +-----------------------+
```

Register identifiers (opcodes):

0000 0000 A
0000 0001 B
0000 0010 C
0000 0011 D
0000 0100 XL   X 0001 0100
0000 0101 XH
0000 0110 YL   Y 0001 0110
0000 0111 YH

Program counter (PC) is 16 bits
Stack counter (SC) is 16 bits
