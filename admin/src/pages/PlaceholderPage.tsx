type Props = {
  title: string;
  description?: string;
};

export function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description ?? "Розділ буде реалізований наступним кроком"}</p>
        </div>
      </div>

      <div className="empty-card">
        <strong>Незабаром тут буде робочий розділ</strong>
        <span>Зараз ми збираємо каркас адмін-панелі.</span>
      </div>
    </div>
  );
}
