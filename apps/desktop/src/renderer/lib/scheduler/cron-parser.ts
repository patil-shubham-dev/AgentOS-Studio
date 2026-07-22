export interface CronFields {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

function matchField(value: number, field: string): boolean {
  if (field === "*") return true
  const parts = field.split(",")
  for (const part of parts) {
    if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10)
      if (step > 0 && value % step === 0) return true
    } else if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number)
      if (value >= lo && value <= hi) return true
    } else if (parseInt(part, 10) === value) {
      return true
    }
  }
  return false
}

export function parseCron(cron: string): CronFields {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${cron}": expected 5 fields, got ${parts.length}`)
  }
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  }
}

export function getNextRun(cron: string): Date {
  const fields = parseCron(cron)
  const now = new Date()
  let candidate = new Date(now)
  candidate.setSeconds(0, 0)

  for (let i = 0; i < 525600; i++) {
    const minute = candidate.getMinutes()
    const hour = candidate.getHours()
    const day = candidate.getDate()
    const month = candidate.getMonth() + 1
    const dow = candidate.getDay()

    if (
      matchField(minute, fields.minute) &&
      matchField(hour, fields.hour) &&
      matchField(day, fields.dayOfMonth) &&
      matchField(month, fields.month) &&
      matchField(dow, fields.dayOfWeek)
    ) {
      if (candidate.getTime() > now.getTime()) return candidate
    }
    candidate = new Date(candidate.getTime() + 60000)
  }

  const fallback = new Date(now.getTime() + 86400000)
  fallback.setSeconds(0, 0)
  return fallback
}

const DAY_NAMES: Record<string, string> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
  "7": "Sunday",
}

function formatTime(hour: string, minute: string): string {
  if (hour === "*") {
    return minute === "*" ? "every minute" : `at minute ${minute} past every hour`
  }
  const h = parseInt(hour, 10)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const mStr = minute === "*" ? "00" : minute.padStart(2, "0")
  return `${h12}:${mStr} ${ampm}`
}

export function getHumanReadable(cron: string): string {
  try {
    const fields = parseCron(cron)
    const { minute, hour, dayOfMonth, month, dayOfWeek } = fields

    if (hour === "*" && minute === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return "Every minute"
    }

    if (hour === "*" && minute !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return `At minute ${minute} past every hour`
    }

    const timeStr = formatTime(hour, minute)

    if (dayOfWeek !== "*" && dayOfMonth === "*" && month === "*") {
      if (dayOfWeek === "1-5") return `Weekdays at ${timeStr}`
      if (dayOfWeek === "0,6" || dayOfWeek === "6,0") return `Weekends at ${timeStr}`
      const days = dayOfWeek.split(",").map((d) => DAY_NAMES[d.trim()] || `day ${d}`).join(", ")
      return `${days} at ${timeStr}`
    }

    if (dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
      return `Day ${dayOfMonth} of every month at ${timeStr}`
    }

    if (dayOfMonth !== "*" && month !== "*" && dayOfWeek === "*") {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      const monthStr = month.split(",").map((n) => monthNames[parseInt(n, 10) - 1] || `month ${n}`).join(", ")
      return `${monthStr} day ${dayOfMonth} at ${timeStr}`
    }

    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return `Every day at ${timeStr}`
    }

    if (hour.includes("/")) {
      const [, step] = hour.split("/")
      return `Every ${step} hours at ${minute === "*" ? "minute 0" : `minute ${minute}`}`
    }

    return `At ${timeStr} (${cron})`
  } catch {
    return cron
  }
}
