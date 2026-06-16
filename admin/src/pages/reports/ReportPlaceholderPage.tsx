type Props = {
  title: string;
  description: string;
};

export function ReportPlaceholderPage({ title, description }: Props) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="panel-card">
        <div className="info-box">
          Цей звіт буде наступним етапом. Спочатку закріплюємо структуру розділу
          та загальну статистику, потім додамо таблиці, фільтри, пагінацію,
          розгортання рядків і Excel.
        </div>
      </div>
    </div>
  );
}
