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
            Этот отчет будет следующим этапом. Сначала закрепляем структуру
            раздела и общую статистику, потом добавим таблицы, фильтры,
            пагинацию, гармошку строк и Excel.
          </div>
        </div>
      </div>
    );
  }