class Clock {
  constructor (speed) {
    this.events = {}
    this.speed = speed
    this.timer = null
  }

  on (event, callback) {
    if (this.events[event]) {
      this.events[event].push(callback);
    } else {
      this.events[event] = [callback];
    }
  }

  trigger (event, data) {
    if (this.events[event]) {
      this.events[event].forEach((callback) => {
        let stopPropagation = false
        const fnStopPropagation = () => stopPropagation = true
        if (!stopPropagation) {
          callback(data, fnStopPropagation)
        }
      })
    }
  }

  tick () {
    this.trigger('tick')
  }

  start () {
    this.timer = setInterval(this.tick.bind(this), this.speed)
    this.trigger('start')
  }

  stop () {
    clearInterval(this.timer)
    this.timer = null
    this.trigger('stop')
  }
}

export default Clock
