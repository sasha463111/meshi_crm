'use client'

import { useState } from 'react'
import { subDays } from 'date-fns'
import { Button } from '@/components/ui/button'

export interface DateRange {
  from: Date
  to: Date
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const presets = [
  { label: 'היום', days: 0 },
  { label: '7 ימים', days: 7 },
  { label: '30 ימים', days: 30 },
  { label: '90 ימים', days: 90 },
]

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [active, setActive] = useState(30)

  return (
    <div className="flex gap-1">
      {presets.map((preset) => (
        <Button
          key={preset.days}
          variant={active === preset.days ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setActive(preset.days)
            onChange({
              from: preset.days === 0 ? new Date() : subDays(new Date(), preset.days),
              to: new Date(),
            })
          }}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}
