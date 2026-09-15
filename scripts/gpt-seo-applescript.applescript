on run argv
  if (count of argv) is less than 3 then error "Expected input JSON path, prompt path, and response JSON path."

  set inputPath to item 1 of argv
  set promptPath to item 2 of argv
  set responsePath to item 3 of argv
  set inputFile to POSIX file inputPath
  set promptText to do shell script "/bin/cat " & quoted form of promptPath

  do shell script "/bin/test -r " & quoted form of inputPath

  tell application "ChatGPT"
    activate
  end tell

  tell application "System Events"
    tell process "ChatGPT"
      try
        click menu item "New Chat" of menu "File" of menu bar 1
      on error errorMessage
        error "Could not open a fresh ChatGPT chat; refusing to submit into an existing conversation: " & errorMessage
      end try
    end tell
  end tell

  delay 1
  tell application "ChatGPT"
    open inputFile
  end tell

  delay 2
  set the clipboard to promptText
  tell application "System Events"
    tell process "ChatGPT"
      set frontmost to true
      keystroke "v" using {command down}
      delay 1
      keystroke return using {command down}
    end tell
  end tell

  return "submitted:" & responsePath
end run
