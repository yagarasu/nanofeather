#Screen

## Text mode
Size 100x32px @ 2 bits per pixel (4 colors)
Memory address: 0xF6E0 - 0xFA00
      800 bytes
      
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

====

STDOUT:
      20x4 chars (5x8)
      
      80 chars total
      160 bytes (1 byte char + 1 byte attrib)
