// Бейдж-креатор внизу страницы — как и раньше, это же клик включает/выключает
// фоновое видео (теперь показывается панелью справа, а не рельсами по бокам).
export default function Credit({ enabled, onToggle }) {
  return (
    <div
      className={'credit' + (enabled ? ' active' : '')}
      data-shorts-toggle=""
      title="Нажмите, чтобы включить/выключить фоновое видео справа"
      onClick={onToggle}
    >
      ✨ Навайбкодил <b>Papaluha</b> ✨
      <span className="shorts-indicator" />
    </div>
  )
}
