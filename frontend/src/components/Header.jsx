import ThemeToggle from './ThemeToggle'

export default function Header({ theme, onToggleTheme }) {
  return (
    // The toggle hangs off the right of the title, so the title itself stays centred.
    <header className="relative">
      <h1 className="font-script text-5xl sm:text-6xl">sift</h1>
      <div className="absolute top-1/2 left-full ml-3 -translate-y-1/2">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  )
}
