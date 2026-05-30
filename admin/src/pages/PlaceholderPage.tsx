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
            <p>{description ?? "Раздел будет реализован следующим шагом"}</p>
          </div>
        </div>
  
        <div className="empty-card">
          <strong>Скоро здесь будет рабочий раздел</strong>
          <span>Сейчас мы собираем каркас админ-панели.</span>
        </div>
      </div>
    );
  }