#CPU

Register based 16 bit machine (to make easier the addressing system).

4 GP 16 bit registers (A, B, C, D)
8 bit words addressable as rH / rL

```
     _______________________
    |           A           |
    +-----------------------+
    | 0000 0000   0000 0000 |
    +-----------------------+
    |     AH    |     AL    |
    +-----------------------+
```

Flag register F addressable as F is 8 bits

Program counter (PC) is 16 bits
Stack counter (SC) is 16 bits
