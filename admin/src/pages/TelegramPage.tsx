import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createTelegramBot,
  createTelegramChannel,
  deleteTelegramBot,
  deleteTelegramChannel,
  getTelegramBots,
  getTelegramChannels,
  updateTelegramBot,
  updateTelegramChannel,
  type TelegramBot,
  type TelegramChannel,
} from "../api/telegram.api";
import { RowActionMenu } from "../components/RowActionMenu";

type BotForm = {
  name: string;
  token: string;
  isActive: boolean;
};

type ChannelForm = {
  botId: number;
  name: string;
  chatId: string;
  isActive: boolean;
};

const initialBotForm: BotForm = {
  name: "",
  token: "",
  isActive: true,
};

const initialChannelForm: ChannelForm = {
  botId: 0,
  name: "",
  chatId: "",
  isActive: true,
};

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } } };
  return maybe.response?.data?.message || fallback;
}

export function TelegramPage() {
  const [bots, setBots] = useState<TelegramBot[]>([]);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [botForm, setBotForm] = useState<BotForm>(initialBotForm);
  const [channelForm, setChannelForm] = useState<ChannelForm>(initialChannelForm);
  const [editingBot, setEditingBot] = useState<TelegramBot | null>(null);
  const [editingChannel, setEditingChannel] = useState<TelegramChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [botsData, channelsData] = await Promise.all([
        getTelegramBots(),
        getTelegramChannels(),
      ]);

      setBots(botsData);
      setChannels(channelsData);

      if (!channelForm.botId && botsData[0]?.id) {
        setChannelForm((prev) => ({ ...prev, botId: botsData[0].id }));
      }
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося завантажити Telegram налаштування"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetBotForm() {
    setEditingBot(null);
    setBotForm(initialBotForm);
    setError("");
  }

  function resetChannelForm() {
    setEditingChannel(null);
    setChannelForm({ ...initialChannelForm, botId: bots[0]?.id ?? 0 });
    setError("");
  }

  function startEditBot(bot: TelegramBot) {
    setEditingBot(bot);
    setBotForm({
      name: bot.name,
      token: "",
      isActive: bot.isActive,
    });
    setError("");
    setSuccess("");
  }

  function startEditChannel(channel: TelegramChannel) {
    setEditingChannel(channel);
    setChannelForm({
      botId: channel.botId,
      name: channel.name,
      chatId: channel.chatId,
      isActive: channel.isActive,
    });
    setError("");
    setSuccess("");
  }

  async function handleBotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!botForm.name.trim()) return setError("Вкажіть назву бота");
    if (!editingBot && !botForm.token.trim()) return setError("Вкажіть токен Telegram-бота");

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingBot) {
        await updateTelegramBot(editingBot.id, {
          name: botForm.name.trim(),
          ...(botForm.token.trim() ? { token: botForm.token.trim() } : {}),
          isActive: botForm.isActive,
        });
        setSuccess("Бот оновлено");
      } else {
        await createTelegramBot({
          name: botForm.name.trim(),
          token: botForm.token.trim(),
          isActive: botForm.isActive,
        });
        setSuccess("Бот створено");
      }

      resetBotForm();
      await loadData();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося зберегти бота"));
    } finally {
      setSaving(false);
    }
  }

  async function handleChannelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!channelForm.botId) return setError("Оберіть бота");
    if (!channelForm.name.trim()) return setError("Вкажіть назву каналу");
    if (!channelForm.chatId.trim()) return setError("Вкажіть chat ID каналу");

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingChannel) {
        await updateTelegramChannel(editingChannel.id, {
          botId: channelForm.botId,
          name: channelForm.name.trim(),
          chatId: channelForm.chatId.trim(),
          isActive: channelForm.isActive,
        });
        setSuccess("Канал оновлено");
      } else {
        await createTelegramChannel({
          botId: channelForm.botId,
          name: channelForm.name.trim(),
          chatId: channelForm.chatId.trim(),
          isActive: channelForm.isActive,
        });
        setSuccess("Канал створено");
      }

      resetChannelForm();
      await loadData();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося зберегти канал"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBot(bot: TelegramBot) {
    if (!window.confirm(`Видалити бота "${bot.name}"? Канали цього бота також буде вимкнено.`)) return;

    try {
      await deleteTelegramBot(bot.id);
      setSuccess("Бот видалено");
      await loadData();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося видалити бота"));
    }
  }

  async function handleDeleteChannel(channel: TelegramChannel) {
    if (!window.confirm(`Видалити канал "${channel.name}"?`)) return;

    try {
      await deleteTelegramChannel(channel.id);
      setSuccess("Канал видалено");
      await loadData();
    } catch (caught) {
      setError(getErrorMessage(caught, "Не вдалося видалити канал"));
    }
  }

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>Telegram</h1>
          <p>Боти та канали для автоматичної відправки звітів нарядів і постів.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="content-grid">
        <div className="panel-card">
          <div className="table-header">
            <div>
              <h2>{editingBot ? "Редагувати бота" : "Додати бота"}</h2>
              <p>Токен видно тільки маскою після збереження.</p>
            </div>
          </div>

          <form className="form-grid" onSubmit={handleBotSubmit}>
            <label>
              Назва бота
              <input
                value={botForm.name}
                onChange={(event) => setBotForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Наприклад: Бот Запоріжжя"
              />
            </label>

            <label>
              Токен Telegram-бота
              <input
                type="password"
                value={botForm.token}
                onChange={(event) => setBotForm((prev) => ({ ...prev, token: event.target.value }))}
                placeholder={editingBot ? "Залиште порожнім, якщо не змінювати" : "123456:ABCDEF..."}
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={botForm.isActive}
                onChange={(event) => setBotForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Активний
            </label>

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingBot ? "Оновити бота" : "Додати бота"}
              </button>
              {editingBot && (
                <button type="button" className="secondary-button" onClick={resetBotForm}>
                  Скасувати
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="panel-card">
          <div className="table-header">
            <div>
              <h2>{editingChannel ? "Редагувати канал" : "Додати канал"}</h2>
              <p>Назва довільна, chat ID береться з Telegram.</p>
            </div>
          </div>

          <form className="form-grid" onSubmit={handleChannelSubmit}>
            <label>
              Бот
              <select
                value={channelForm.botId}
                onChange={(event) => setChannelForm((prev) => ({ ...prev, botId: Number(event.target.value) }))}
              >
                <option value={0}>Оберіть бота</option>
                {bots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Назва каналу
              <input
                value={channelForm.name}
                onChange={(event) => setChannelForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Наприклад: ГБР Запоріжжя"
              />
            </label>

            <label>
              Telegram chat ID
              <input
                value={channelForm.chatId}
                onChange={(event) => setChannelForm((prev) => ({ ...prev, chatId: event.target.value }))}
                placeholder="Наприклад: -1001212123"
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={channelForm.isActive}
                onChange={(event) => setChannelForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Активний
            </label>

            <div className="form-actions">
              <button type="submit" disabled={saving || bots.length === 0}>
                {saving ? "Збереження..." : editingChannel ? "Оновити канал" : "Додати канал"}
              </button>
              {editingChannel && (
                <button type="button" className="secondary-button" onClick={resetChannelForm}>
                  Скасувати
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="content-grid">
        <div className="panel-card table-card">
          <div className="table-header">
            <div>
              <h2>Боти</h2>
              <p>Збережені токени не відображаються повністю.</p>
            </div>
          </div>

          {loading ? (
            <p>Завантаження...</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Токен</th>
                    <th>Каналів</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bots.map((bot) => (
                    <tr key={bot.id}>
                      <td>{bot.name}</td>
                      <td>{bot.tokenMasked}</td>
                      <td>{bot.channelsCount ?? 0}</td>
                      <td>{bot.isActive ? "Активний" : "Вимкнений"}</td>
                      <td>
                        <RowActionMenu
                          items={[
                            { label: "Редагувати", onClick: () => startEditBot(bot), variant: "edit" },
                            { label: "Видалити", onClick: () => handleDeleteBot(bot), variant: "danger" },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {bots.length === 0 && (
                    <tr>
                      <td colSpan={5}>Ботів ще немає</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel-card table-card">
          <div className="table-header">
            <div>
              <h2>Канали</h2>
              <p>Ці канали обираються у нарядах ГШР та додаткових постах.</p>
            </div>
          </div>

          {loading ? (
            <p>Завантаження...</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Chat ID</th>
                    <th>Бот</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.id}>
                      <td>{channel.name}</td>
                      <td>{channel.chatId}</td>
                      <td>{channel.bot?.name || channel.botId}</td>
                      <td>{channel.isActive ? "Активний" : "Вимкнений"}</td>
                      <td>
                        <RowActionMenu
                          items={[
                            { label: "Редагувати", onClick: () => startEditChannel(channel), variant: "edit" },
                            { label: "Видалити", onClick: () => handleDeleteChannel(channel), variant: "danger" },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {channels.length === 0 && (
                    <tr>
                      <td colSpan={5}>Каналів ще немає</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
