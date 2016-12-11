# Interrupts

## Software interrupts

To request a resource from the VM, you can issue a software interrupt from within the code using the INT mnemonic.

The implementation of such interrupts are handled with the assignInterrupt function, passing down an INT number and a handler. The handler is executed under the CPU context, so the memory, the regsters, the status register and all the resources are available to the handler. It's a good idea to interface with these resources for arguments and output.

## Hardware interrupts

Communicates with the CPU through IRQ events. The IRQ event triggers an interrupt (halts the program and runs the ISR handler).

Eg:
```
      Real    :    VM
              :
    Keyboard  :   Device       CPU      ISR
        |     :     |           |        |
        |-----:---->|---------->|------->|
        |     :  onKeypress    IRQ      call
        |     :     |           |        |
        |     :     |<------------------>|
        |     :     |      state change  |
        |     :     |<-------------------|
        |     :     |      acknowledge   |
        |     :     |           |<-------|
        |     :     |           |   IRET |
```