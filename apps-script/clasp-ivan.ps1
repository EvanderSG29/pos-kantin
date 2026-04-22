param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

& clasp -u ivan -P . @Args
