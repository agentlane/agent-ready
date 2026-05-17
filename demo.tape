Output docs/demo.gif

Require node

Set FontSize 14
Set Width 860
Set Height 440
Set Theme "Catppuccin Mocha"
Set Padding 24
Set MarginFill "#1e1e2e"
Set TypingSpeed 42ms
Set PlaybackSpeed 1

Hide
  Type `cd /Users/shoaib/GitHub/agent-ready && export PS1="$ " && clear`
  Enter
  Sleep 800ms
Show

Sleep 400ms
Type "agent-ready check examples/tickets/bad-ticket.json"
Sleep 500ms
Enter
Sleep 2500ms

Sleep 1000ms
Type "agent-ready check examples/tickets/good-ticket.json"
Sleep 500ms
Enter
Sleep 2500ms

Sleep 3s
