import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { getAdditionalAlarmReasons } from "../api/additional-alarm-reasons.api";
import type { AdditionalAlarmReason } from "../api/additional-alarm-reasons.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getCrews } from "../api/crews.api";
import type { Crew } from "../api/crews.api";
import { getEmployees } from "../api/employees.api";
import type { Employee } from "../api/employees.api";
import { createManualShift } from "../api/manual-shifts.api";
import type { ManualTripEventInput } from "../api/manual-shifts.api";
import { getTripGoals } from "../api/trip-goals.api";
import type { TripGoal } from "../api/trip-goals.api";
import { getVehicles } from "../api/vehicles.api";
import type { Vehicle } from "../api/vehicles.api";
import { AccordionSection } from "../components/AccordionSection";

type TripForm = {
  fromLocation: string;
  departureTime: string;
  toLocation: string;
  arrivalTime: string;
  arrivalMinutes: string;
  distanceKm: string;
  goalId: number;
  note: string;

  isCombat: boolean;
  detainedCount: string;
  transferredCount: string;

  reasonId: number;
  customReasonText: string;
  ohCount: string;
  partnerCount: string;
};

type ShiftForm = {
  cityId: number;
  crewId: number;
  vehicleId: number;
  driverEmployeeId: number;
  seniorEmployeeId: number;

  driverHasWeapon: boolean;
  seniorHasWeapon: boolean;

  shiftDate: string;
  submittedAt: string;

  odometerStart: string;
};

const initialShiftForm: ShiftForm = {
  cityId: 0,
  crewId: 0,
  vehicleId: 0,
  driverEmployeeId: 0,
  seniorEmployeeId: 0,

  driverHasWeapon: false,
  seniorHasWeapon: false,

  shiftDate: "",
  submittedAt: "",

  odometerStart: "",
};

function createEmptyTrip(): TripForm {
  return {
    fromLocation: "",
    departureTime: "",
    toLocation: "",
    arrivalTime: "",
    arrivalMinutes: "",
    distanceKm: "",
    goalId: 0,
    note: "",

    isCombat: false,
    detainedCount: "0",
    transferredCount: "0",

    reasonId: 0,
    customReasonText: "",
    ohCount: "0",
    partnerCount: "0",
  };
}

function toIsoDateTime(value: string) {
  if (!value) return "";

  return new Date(value).toISOString();
}

function toNumber(value: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return numberValue;
}
function calculateArrivalMinutesValue(departureTime: string, arrivalTime: string) {
  if (!departureTime || !arrivalTime) {
    return "";
  }

  const departure = new Date(departureTime);
  const arrival = new Date(arrivalTime);

  if (
    Number.isNaN(departure.getTime()) ||
    Number.isNaN(arrival.getTime()) ||
    arrival.getTime() < departure.getTime()
  ) {
    return "";
  }

  const diffMinutes = Math.round(
    (arrival.getTime() - departure.getTime()) / 1000 / 60
  );

  return String(diffMinutes);
}

function formatGoalCode(goal?: TripGoal) {
  return goal?.systemCode ?? "";
}

export function ManualShiftCreatePage() {
  const [form, setForm] = useState<ShiftForm>(initialShiftForm);
  const [trips, setTrips] = useState<TripForm[]>([createEmptyTrip()]);

  const [cities, setCities] = useState<City[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tripGoals, setTripGoals] = useState<TripGoal[]>([]);
  const [reasons, setReasons] = useState<AdditionalAlarmReason[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [openedSections, setOpenedSections] = useState({
    main: false,
    trips: false,
  });

  const [openedTrips, setOpenedTrips] = useState<Record<number, boolean>>({});

  function toggleSection(section: "main" | "trips") {
    setOpenedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  function toggleTrip(index: number) {
    setOpenedTrips((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }

  async function loadReferences() {
    setLoading(true);
    setError("");

    try {
      const [
        citiesData,
        crewsData,
        vehiclesData,
        employeesData,
        goalsData,
        reasonsData,
      ] = await Promise.all([
        getAccessibleCities(false),
        getCrews(undefined, false),
        getVehicles(undefined, false),
        getEmployees(undefined, false),
        getTripGoals(false),
        getAdditionalAlarmReasons(false),
      ]);

      setCities(citiesData);
      setCrews(crewsData);
      setVehicles(vehiclesData);
      setEmployees(employeesData);
      setTripGoals(goalsData);
      setReasons(reasonsData);
    } catch {
      setError("Не удалось загрузить справочники");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferences();
  }, []);

  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities]
  );

  const filteredCrews = useMemo(
    () =>
      crews.filter((crew) =>
        form.cityId ? crew.cityId === form.cityId : true
      ),
    [crews, form.cityId]
  );

  const filteredVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) =>
        form.cityId ? vehicle.cityId === form.cityId : true
      ),
    [vehicles, form.cityId]
  );

  const filteredEmployees = useMemo(
    () =>
      employees.filter((employee) =>
        form.cityId ? employee.cityId === form.cityId : true
      ),
    [employees, form.cityId]
  );

  const totalDistanceKm = useMemo(
    () =>
      trips.reduce((sum, trip) => {
        return sum + toNumber(trip.distanceKm);
      }, 0),
    [trips]
  );

  const odometerEnd = useMemo(() => {
    const start = toNumber(form.odometerStart);
    return Number((start + totalDistanceKm).toFixed(1));
  }, [form.odometerStart, totalDistanceKm]);

  function updateForm<Key extends keyof ShiftForm>(
    key: Key,
    value: ShiftForm[Key]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "cityId"
        ? {
          crewId: 0,
          vehicleId: 0,
          driverEmployeeId: 0,
          seniorEmployeeId: 0,
        }
        : {}),
    }));
  }

  function updateTrip<Key extends keyof TripForm>(
    index: number,
    key: Key,
    value: TripForm[Key]
  ) {
    setTrips((prev) =>
      prev.map((trip, tripIndex) => {
        if (tripIndex !== index) {
          return trip;
        }

        const nextTrip = {
          ...trip,
          [key]: value,
        };

        if (key === "departureTime" || key === "arrivalTime") {
          nextTrip.arrivalMinutes = calculateArrivalMinutesValue(
            nextTrip.departureTime,
            nextTrip.arrivalTime
          );
        }

        return nextTrip;
      })
    );
  }

  function addTrip() {
    setTrips((prev) => {
      const previousTrip = prev[prev.length - 1];

      return [
        ...prev,
        {
          ...createEmptyTrip(),
          fromLocation: previousTrip?.toLocation ?? "",
        },
      ];
    });
  }

  function removeTrip(index: number) {
    setTrips((prev) => {
      if (prev.length === 1) {
        return prev;
      }

      return prev.filter((_, tripIndex) => tripIndex !== index);
    });
  }

  function getGoal(goalId: number) {
    return tripGoals.find((goal) => goal.id === goalId);
  }

  function buildTripEvents(trip: TripForm): ManualTripEventInput[] {
    const goal = getGoal(trip.goalId);
    const systemCode = formatGoalCode(goal);

    const detainedCount = toNumber(trip.detainedCount);
    const transferredCount = toNumber(trip.transferredCount);

    if (systemCode === "alarm_oh") {
      return [
        {
          eventCategory: "REGULAR_ALARM",
          alarmSource: "OH",
          isCombat: trip.isCombat,
          detainedCount,
          transferredCount,
        },
      ];
    }

    if (systemCode === "alarm_partner") {
      return [
        {
          eventCategory: "REGULAR_ALARM",
          alarmSource: "PARTNER",
          isCombat: trip.isCombat,
          detainedCount,
          transferredCount,
        },
      ];
    }

    if (systemCode === "additional_alarm_list") {
      return [
        {
          eventCategory: "ADDITIONAL_ALARM",
          reasonId: trip.reasonId || null,
          customReasonText: trip.customReasonText || null,
          ohCount: toNumber(trip.ohCount),
          partnerCount: toNumber(trip.partnerCount),
          detainedCount,
          transferredCount,
        },
      ];
    }

    return [];
  }

  function validateForm() {
    if (!form.cityId) return "Выберите город";
    if (!form.crewId) return "Выберите наряд";
    if (!form.vehicleId) return "Выберите автомобиль";
    if (!form.driverEmployeeId) return "Выберите водителя";
    if (!form.seniorEmployeeId) return "Выберите старшего";

    if (form.driverEmployeeId === form.seniorEmployeeId) {
      return "Водитель и старший не могут быть одним сотрудником";
    }

    if (!form.shiftDate) return "Укажите дату и время начала смены";

    if (!form.odometerStart || toNumber(form.odometerStart) < 0) {
      return "Укажите корректный спидометр на начало смены";
    }

    for (let index = 0; index < trips.length; index += 1) {
      const trip = trips[index];
      const number = index + 1;

      if (!trip.fromLocation.trim()) return `Поездка ${number}: заполните Откуда`;
      if (!trip.toLocation.trim()) return `Поездка ${number}: заполните Куда`;
      if (!trip.departureTime) return `Поездка ${number}: укажите время выезда`;
      if (!trip.arrivalTime) return `Поездка ${number}: укажите время прибытия`;
      if (!trip.arrivalMinutes) {
        return `Поездка ${number}: время прибытия должно быть позже времени выезда`;
      }
      if (!trip.distanceKm) return `Поездка ${number}: укажите расстояние`;
      if (!trip.goalId) return `Поездка ${number}: выберите цель поездки`;

      const goal = getGoal(trip.goalId);
      const systemCode = formatGoalCode(goal);

      if (systemCode === "additional_alarm_list") {
        const totalAdditional = toNumber(trip.ohCount) + toNumber(trip.partnerCount);

        if (totalAdditional <= 0) {
          return `Поездка ${number}: укажите количество доп. сработок`;
        }

        if (!trip.reasonId && !trip.customReasonText.trim()) {
          return `Поездка ${number}: выберите причину доп. сработок`;
        }
      }
    }

    return "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await createManualShift({
        cityId: form.cityId,
        crewId: form.crewId,
        vehicleId: form.vehicleId,
        driverEmployeeId: form.driverEmployeeId,
        seniorEmployeeId: form.seniorEmployeeId,

        driverHasWeapon: form.driverHasWeapon,
        seniorHasWeapon: form.seniorHasWeapon,

        shiftDate: toIsoDateTime(form.shiftDate),
        submittedAt: form.submittedAt ? toIsoDateTime(form.submittedAt) : undefined,

        odometerStart: toNumber(form.odometerStart),

        trips: trips.map((trip) => ({
          fromLocation: trip.fromLocation.trim(),
          departureTime: toIsoDateTime(trip.departureTime),
          toLocation: trip.toLocation.trim(),
          arrivalTime: toIsoDateTime(trip.arrivalTime),
          arrivalMinutes: toNumber(trip.arrivalMinutes),
          distanceKm: toNumber(trip.distanceKm),
          goalId: trip.goalId,
          note: trip.note.trim() || null,
          events: buildTripEvents(trip),
        })),
      });

      setSuccess("Смена успешно добавлена");
      setForm(initialShiftForm);
      setTrips([createEmptyTrip()]);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось добавить смену");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Добавить смену вручную</h1>
          <p>Ручное создание смены администратором с поездками и сработками</p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Загрузка справочников...</div>
      ) : (
        <form className="manual-shift-form" onSubmit={handleSubmit}>
          <div className="panel-card manual-accordion-card">
            <AccordionSection
              title="Основные данные смены"
              subtitle="Город, наряд, автомобиль, экипаж, время и пробег"
              open={openedSections.main}
              onToggle={() => toggleSection("main")}
            >
              <h2>Основные данные смены</h2>

              <div className="manual-form-grid">
                <label className="field">
                  <span>Город</span>
                  <select
                    value={form.cityId}
                    onChange={(event) =>
                      updateForm("cityId", Number(event.target.value))
                    }
                  >
                    <option value={0}>Выберите город</option>

                    {activeCities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Наряд</span>
                  <select
                    value={form.crewId}
                    onChange={(event) =>
                      updateForm("crewId", Number(event.target.value))
                    }
                  >
                    <option value={0}>Выберите наряд</option>

                    {filteredCrews.map((crew) => (
                      <option key={crew.id} value={crew.id}>
                        {crew.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Автомобиль</span>
                  <select
                    value={form.vehicleId}
                    onChange={(event) =>
                      updateForm("vehicleId", Number(event.target.value))
                    }
                  >
                    <option value={0}>Выберите автомобиль</option>

                    {filteredVehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.title}
                        {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Дата и время начала смены</span>
                  <input
                    type="datetime-local"
                    value={form.shiftDate}
                    onChange={(event) => updateForm("shiftDate", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Время отправки отчета</span>
                  <input
                    type="datetime-local"
                    value={form.submittedAt}
                    onChange={(event) =>
                      updateForm("submittedAt", event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Спидометр начало</span>
                  <input
                    type="number"
                    min="0"
                    value={form.odometerStart}
                    onChange={(event) =>
                      updateForm("odometerStart", event.target.value)
                    }
                    placeholder="100000"
                  />
                </label>

                <label className="field">
                  <span>Спидометр конец</span>
                  <input value={odometerEnd || ""} disabled />
                </label>
              </div>

              <div className="manual-form-grid manual-form-grid-two">
                <div className="manual-person-card">
                  <label className="field">
                    <span>Водитель</span>
                    <select
                      value={form.driverEmployeeId}
                      onChange={(event) =>
                        updateForm(
                          "driverEmployeeId",
                          Number(event.target.value)
                        )
                      }
                    >
                      <option value={0}>Выберите водителя</option>

                      {filteredEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={form.driverHasWeapon}
                      onChange={(event) =>
                        updateForm("driverHasWeapon", event.target.checked)
                      }
                    />
                    <span>Водитель с оружием</span>
                  </label>
                </div>

                <div className="manual-person-card">
                  <label className="field">
                    <span>Старший</span>
                    <select
                      value={form.seniorEmployeeId}
                      onChange={(event) =>
                        updateForm(
                          "seniorEmployeeId",
                          Number(event.target.value)
                        )
                      }
                    >
                      <option value={0}>Выберите старшего</option>

                      {filteredEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={form.seniorHasWeapon}
                      onChange={(event) =>
                        updateForm("seniorHasWeapon", event.target.checked)
                      }
                    />
                    <span>Старший с оружием</span>
                  </label>
                </div>
              </div>
            </AccordionSection>
          </div>

          <div className="panel-card manual-accordion-card">
            <AccordionSection
              title="Поездки"
              subtitle={`Всего поездок: ${trips.length} · Общий пробег: ${totalDistanceKm.toFixed(
                1
              )} км`}
              open={openedSections.trips}
              onToggle={() => toggleSection("trips")}
            >
              <div className="manual-trips-toolbar">
                <div>
                  <strong>Поездки смены: </strong>
                  <span>Добавляй маршруты, цели поездок и сработки</span>
                </div>

            
              </div>

              <div className="manual-trip-list">
                {trips.map((trip, index) => {
                  const goal = getGoal(trip.goalId);
                  const systemCode = formatGoalCode(goal);
                  const isRegularAlarm =
                    systemCode === "alarm_oh" || systemCode === "alarm_partner";
                  const isAdditionalAlarm = systemCode === "additional_alarm_list";

                  return (
                    <div className="manual-trip-card" key={index}>
                    <AccordionSection
                      title={`Поездка ${index + 1}`}
                      subtitle={`${trip.fromLocation || "Откуда не указано"} → ${
                        trip.toLocation || "Куда не указано"
                      } · ${trip.distanceKm || "0"} км`}
                      open={Boolean(openedTrips[index])}
                      onToggle={() => toggleTrip(index)}
                    >
                      <div className="manual-trip-card-header">
                        <h3>Поездка {index + 1}</h3>

                        {trips.length > 1 && (
                          <button
                            type="button"
                            className="small-button danger-button"
                            onClick={() => removeTrip(index)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>

                      <div className="manual-form-grid">
                        <label className="field">
                          <span>Откуда</span>
                          <input
                            value={trip.fromLocation}
                            onChange={(event) =>
                              updateTrip(index, "fromLocation", event.target.value)
                            }
                            placeholder="База"
                          />
                        </label>

                        <label className="field">
                          <span>Время выезда</span>
                          <input
                            type="datetime-local"
                            value={trip.departureTime}
                            onChange={(event) =>
                              updateTrip(index, "departureTime", event.target.value)
                            }
                          />
                        </label>

                        <label className="field">
                          <span>Куда</span>
                          <input
                            value={trip.toLocation}
                            onChange={(event) =>
                              updateTrip(index, "toLocation", event.target.value)
                            }
                            placeholder="Объект 1045"
                          />
                        </label>

                        <label className="field">
                          <span>Время прибытия</span>
                          <input
                            type="datetime-local"
                            value={trip.arrivalTime}
                            onChange={(event) =>
                              updateTrip(index, "arrivalTime", event.target.value)
                            }
                          />
                        </label>

                        <label className="field">
                          <span>Прибытие, мин</span>
                          <input
                            value={trip.arrivalMinutes}
                            disabled
                            placeholder="Автоматически"
                          />
                        </label>

                        <label className="field">
                          <span>Расстояние, км</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={trip.distanceKm}
                            onChange={(event) =>
                              updateTrip(index, "distanceKm", event.target.value)
                            }
                          />
                        </label>

                        <label className="field">
                          <span>Цель поездки</span>
                          <select
                            value={trip.goalId}
                            onChange={(event) =>
                              updateTrip(index, "goalId", Number(event.target.value))
                            }
                          >
                            <option value={0}>Выберите цель</option>

                            {tripGoals.map((goalItem) => (
                              <option key={goalItem.id} value={goalItem.id}>
                                {goalItem.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          <span>Примечание</span>
                          <input
                            value={trip.note}
                            onChange={(event) =>
                              updateTrip(index, "note", event.target.value)
                            }
                            placeholder="Необязательно"
                          />
                        </label>
                      </div>

                      {isRegularAlarm && (
                        <div className="manual-event-box">
                          <h4>
                            {systemCode === "alarm_oh"
                              ? "Сработка ОХ"
                              : "Сработка Партнеры"}
                          </h4>

                          <div className="manual-form-grid">
                            <label className="field">
                              <span>Тип</span>
                              <select
                                value={String(trip.isCombat)}
                                onChange={(event) =>
                                  updateTrip(
                                    index,
                                    "isCombat",
                                    event.target.value === "true"
                                  )
                                }
                              >
                                <option value="false">Ложная</option>
                                <option value="true">Боевая</option>
                              </select>
                            </label>

                            <label className="field">
                              <span>Задержано</span>
                              <input
                                type="number"
                                min="0"
                                value={trip.detainedCount}
                                onChange={(event) =>
                                  updateTrip(
                                    index,
                                    "detainedCount",
                                    event.target.value
                                  )
                                }
                              />
                            </label>

                            <label className="field">
                              <span>Передано</span>
                              <input
                                type="number"
                                min="0"
                                value={trip.transferredCount}
                                onChange={(event) =>
                                  updateTrip(
                                    index,
                                    "transferredCount",
                                    event.target.value
                                  )
                                }
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {isAdditionalAlarm && (
                        <div className="manual-event-box">
                          <h4>Список сработок</h4>

                          <div className="manual-form-grid">
                            <label className="field">
                              <span>Причина</span>
                              <select
                                value={trip.reasonId}
                                onChange={(event) =>
                                  updateTrip(index, "reasonId", Number(event.target.value))
                                }
                              >
                                <option value={0}>Выберите причину</option>

                                {reasons.map((reason) => (
                                  <option key={reason.id} value={reason.id}>
                                    {reason.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="field">
                              <span>Своя причина</span>
                              <input
                                value={trip.customReasonText}
                                onChange={(event) =>
                                  updateTrip(
                                    index,
                                    "customReasonText",
                                    event.target.value
                                  )
                                }
                                placeholder="Если нужно"
                              />
                            </label>

                            <label className="field">
                              <span>Количество ОХ</span>
                              <input
                                type="number"
                                min="0"
                                value={trip.ohCount}
                                onChange={(event) =>
                                  updateTrip(index, "ohCount", event.target.value)
                                }
                              />
                            </label>

                            <label className="field">
                              <span>Количество Партнеры</span>
                              <input
                                type="number"
                                min="0"
                                value={trip.partnerCount}
                                onChange={(event) =>
                                  updateTrip(index, "partnerCount", event.target.value)
                                }
                              />
                            </label>

                            <label className="field">
                              <span>Задержано</span>
                              <input
                                type="number"
                                min="0"
                                value={trip.detainedCount}
                                onChange={(event) =>
                                  updateTrip(
                                    index,
                                    "detainedCount",
                                    event.target.value
                                  )
                                }
                              />
                            </label>

                            <label className="field">
                              <span>Передано</span>
                              <input
                                type="number"
                                min="0"
                                value={trip.transferredCount}
                                onChange={(event) =>
                                  updateTrip(
                                    index,
                                    "transferredCount",
                                    event.target.value
                                  )
                                }
                              />
                            </label>
                          </div>
                        </div>
                      )}
                       </AccordionSection>
                    </div>
                  );
                })}
            <button
                  type="button"
                  className="secondary-button"
                  onClick={addTrip}
                >
                  Добавить поездку
                </button>
              </div>
            </AccordionSection>
          </div>

          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}

          <div className="manual-submit-bar center">
            <button className="primary-button" disabled={saving}>
              {saving ? "Сохраняем..." : "Добавить смену"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}