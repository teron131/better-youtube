
import { Button } from "@ui/components/ui/button"
import { Input } from "@ui/components/ui/input"
import { cn } from "@ui/lib/utils"
import { Check, ChevronDown } from "lucide-react"
import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

export interface ComboboxOption {
  value: string
  label: string
  icon?: React.ReactNode
}

interface EditableComboboxProps {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  className?: string
  inputClassName?: string
  renderOption?: (option: ComboboxOption) => React.ReactNode
  renderIcon?: (value: string) => React.ReactNode
  type?: "text" | "url"
}

export function EditableCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  inputClassName,
  renderOption,
  renderIcon,
  type = "text",
}: EditableComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchText, setSearchText] = React.useState("")
  const [triggerWidth, setTriggerWidth] = React.useState<number | undefined>(undefined)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sync searchText with value when value changes externally (only when closed)
  React.useEffect(() => {
    if (!open) {
      setSearchText(value || "")
    }
  }, [value, open])

  // Measure trigger width for the portal content
  React.useEffect(() => {
    if (open && containerRef.current) {
      setTriggerWidth(containerRef.current.offsetWidth)
    }
  }, [open])

  // Filter options: show all when searchText is empty or matches current value, otherwise filter
  const filteredOptions = React.useMemo(() => {
    if (!searchText || searchText === value) return options
    
    const lowerSearch = searchText.toLowerCase()
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(lowerSearch) ||
        option.value.toLowerCase().includes(lowerSearch)
    )
  }, [searchText, value, options])

  const openDropdown = () => {
    setSearchText("")
    setOpen(true)
  }

  const closeDropdown = () => {
    setOpen(false)
    setSearchText(value || "")
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setSearchText(newValue)
    onChange(newValue)
    if (!open) setOpen(true)
  }

  const handleOptionSelect = (optionValue: string) => {
    onChange(optionValue)
    setSearchText(optionValue)
    setOpen(false)
  }

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setOpen(true)
    // Don't clear search text immediately, let user see current value
    // but select it so typing replaces it
    e.target.select()
  }

  const toggleOpen = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (open) {
      closeDropdown()
    } else {
      openDropdown()
    }
  }

  const displayValue = open ? (searchText || value || "") : (value || "")

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
        <PopoverPrimitive.Anchor asChild>
          <div className="relative flex items-center">
            {/* Render icon inside input if provided */}
            {renderIcon && (
              <div className="absolute left-3 z-10 flex items-center justify-center pointer-events-none">
                {renderIcon(value)}
              </div>
            )}
            
            <Input
              ref={inputRef}
              type={type}
              value={displayValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onClick={() => !open && setOpen(true)}
              placeholder={placeholder}
              className={cn(
                "pr-10 transition-all duration-200", 
                renderIcon ? "pl-10" : "pl-3",
                open ? "ring-2 ring-ring ring-offset-2 border-primary/50" : "border-border/50",
                inputClassName
              )}
              autoComplete="off"
            />
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground hover:bg-transparent"
              onClick={toggleOpen}
              aria-label="Toggle options"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
            </Button>
          </div>
        </PopoverPrimitive.Anchor>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className="z-[9999] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
            style={{ width: triggerWidth }}
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Prevent closing when clicking the input or container
              if (containerRef.current?.contains(e.target as Node)) {
                e.preventDefault()
              }
            }}
          >
            <div className="max-h-60 overflow-y-auto p-1 bg-zinc-900 border-zinc-800">
              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-500">
                  No options found. Type a custom value.
                </div>
              ) : (
                <div className="grid gap-0.5">
                  {filteredOptions.map((option) => (
                    <div
                      key={option.value}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm outline-none hover:bg-primary/20 hover:text-white transition-colors",
                        value === option.value && "bg-primary/10 text-primary font-medium"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault() // Prevent focus loss from input
                        handleOptionSelect(option.value)
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {renderOption ? (
                          renderOption(option)
                        ) : (
                          <>
                            {option.icon && <span className="flex h-4 w-4 items-center justify-center">{option.icon}</span>}
                            <span>{option.label}</span>
                          </>
                        )}
                      </div>
                      {value === option.value && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
