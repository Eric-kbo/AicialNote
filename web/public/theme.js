// Applied before first paint to avoid a flash of the wrong theme.
;(() => {
  const t = localStorage.getItem('aicialnote.theme')
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
})()
