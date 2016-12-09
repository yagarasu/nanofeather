#Screen

## Text mode
Size 100x32px @ 2 bits per pixel (4 colors)
Memory address: 0xF6E0 - 0xFA00
      800 bytes = 10 pags
      
      Each byte represents:
      s: status
      c: char
      ss cc cccc
      
      

Size: 100x32px @ 2 bits per pixel (4 colors)
Memory address: 0xF6E0 - 0xFA00
      800 bytes

Size: 100x32px @ 1 bits per pixel (2 colors)
Memory address: 0x1EF0 - 0x1F40
      80 bytes

Sprites for basic chars. 5x8px @ 1bpp (40bits).
1-0     : 10 sprites : 400 bits
A-Z     : 26 sprites : 1040 bits
!,.-    : 26 sprites : 1040 bits
_><"
#$%&
/()=
?|\[
]*{}
;· █

SUM bits    : 2480 bits     - 310 bytes
SUM sprites : 62 sprites    - addr 0x00 - 0x3F





0     <nl>  10    0     20    <sp>  30    P
1     +     11    1     21    A     31    Q
2     -     12    2     22    B     32    R
3     *     13    3     23    C     33    S
4     /     14    4     24    D     34    T
5     _     15    5     25    E     35    U
6     .     16    6     26    F     36    V
7     ,     17    7     27    G     37    W
8     ;     18    8     28    H     38    X
9     >     19    9     29    I     39    Y
A     <     1A    =     2A    J     3A    Z
B     ?     1B    :     2B    K     3B    @
C     !     1C    [     2C    L     3C    #
D     "     1D    ]     2D    M     3D    $
E     (     1E    {     2E    N     3E    %
F     )     1F    }     2F    O     3F    &

====

STDOUT:
      20x4 chars (5x8)
      
      80 chars total
      160 bytes (1 byte char + 1 byte attrib)
