import { EventEmitter } from 'events-es6'

class Clock extends EventEmitter {
  constructor (speed) {
    super()
    this.speed = speed
    this.timer = null
  }

  tick () {
    this.emit('tick')
  }

  start () {
    this.timer = setInterval(this.tick.bind(this), this.speed)
    this.emit('start')
  }

  stop () {
    clearInterval(this.timer)
    this.timer = null
    this.emit('stop')
  }
}

export default Clock
