import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAdditionalAlarmReasons } from "../api/additional-alarm-reasons.api";
import type { AdditionalAlarmReason } from "../api/additional-alarm-reasons.api";
import { getAccessibleCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import { getCrews } from "../api/crews.api";
import type { Crew } from "../api/crews.api";
import { getEmployees } from "../api/employees.api";
import type { Employee } from "../api/employees.api";
import {
  getManualShiftById,
  updateManualShift,
} from "../api/manual-shifts.api";
import type {
  ManualShiftDetailsTrip,
  ManualTripEventInput,
} from "../api/manual-shifts.api";
import { getTripGoals } from "../api/trip-goals.api";
import type { TripGoal } from "../api/trip-goals.api";
import { getVehicles } from "../api/vehicles.api";
import type { Vehicle } from "../api/vehicles.api";

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

function toNumber(value: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return numberValue;
}

function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  if (!value) return "";

  return new Date(value).toISOString();
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

function mapTripToForm(trip: ManualShiftDetailsTrip): TripForm {
  const event = trip.events[0];

  return {
    fromLocation: trip.fromLocation ?? "",
    departureTime: toDatetimeLocal(trip.departureTime),
    toLocation: trip.toLocation ?? "",
    arrivalTime: toDatetimeLocal(trip.arrivalTime),
    arrivalMinutes: String(trip.arrivalMinutes ?? ""),
    distanceKm: String(trip.distanceKm ?? ""),
    goalId: trip.goalId,
    note: trip.note ?? "",

    isCombat: Boolean(event?.isCombat),
    detainedCount: String(event?.detainedCount ?? 0),
    transferredCount: String(event?.transferredCount ?? 0),

    reasonId: event?.reasonId ?? 0,
    customReasonText: event?.customReasonText ?? "",
    ohCount: String(event?.ohCount ?? 0),
    partnerCount: String(event?.partnerCount ?? 0),
  };
}

export function ManualShiftEditPage() {
  const params = useParams();
  const navigate = useNavigate();

  const shiftId = Number(params.id);

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

  async function loadData() {
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
        shift,
      ] = await Promise.all([
        getAccessibleCities(false),
        getCrews(undefined, false),
        getVehicles(undefined, false),
        getEmployees(undefined, false),
        getTripGoals(false),
        getAdditionalAlarmReasons(false),
        getManualShiftById(shiftId),
      ]);

      setCities(citiesData);
      setCrews(crewsData);
      setVehicles(vehiclesData);
      setEmployees(employeesData);
      setTripGoals(goalsData);
      setReasons(reasonsData);

      setForm({
        cityId: shift.cityId,
        crewId: shift.crewId,
        vehicleId: shift.vehicleId,
        driverEmployeeId: shift.driverEmployeeId,
        seniorEmployeeId: shift.seniorEmployeeId,

        driverHasWeapon: shift.driverHasWeapon,
        seniorHasWeapon: shift.seniorHasWeapon,

        shiftDate: toDatetimeLocal(shift.shiftDate),
        submittedAt: toDatetimeLocal(shift.submittedAt),

        odometerStart: String(shift.odometerStart ?? ""),
      });

      setTrips(
        shift.trips.length
          ? shift.trips.map(mapTripToForm)
          : [createEmptyTrip()]
      );
    } catch {
      setError("Не вдалося завантажити зміну");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isInteger(shiftId)) {
      setError("Некоректний ID зміни");
      setLoading(false);
      return;
    }

    loadData();
  }, [shiftId]);

  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities]
  );

  const filteredCrews = useMemo(
    () => crews.filter((crew) => (form.cityId ? crew.cityId === form.cityId : true)),
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
    if (!form.cityId) return "Оберіть місто";
    if (!form.crewId) return "Оберіть наряд";
    if (!form.vehicleId) return "Оберіть автомобіль";
    if (!form.driverEmployeeId) return "Оберіть водія";
    if (!form.seniorEmployeeId) return "Оберіть старшого";

    if (form.driverEmployeeId === form.seniorEmployeeId) {
      return "Водій і старший не можуть бути одним співробітником";
    }

    if (!form.shiftDate) return "Вкажіть дату й час початку зміни";

    if (!form.odometerStart || toNumber(form.odometerStart) < 0) {
      return "Вкажіть коректний спідометр на початку зміни";
    }

    for (let index = 0; index < trips.length; index += 1) {
      const trip = trips[index];
      const number = index + 1;

      if (!trip.fromLocation.trim()) return `Поїздка ${number}: заповніть Звідки`;
      if (!trip.toLocation.trim()) return `Поїздка ${number}: заповніть Куди`;
      if (!trip.departureTime) return `Поїздка ${number}: вкажіть час виїзду`;
      if (!trip.arrivalTime) return `Поїздка ${number}: вкажіть час прибуття`;

      if (!trip.arrivalMinutes) {
        return `Поїздка ${number}: час прибуття має бути пізніше часу виїзду`;
      }

      if (!trip.distanceKm) return `Поїздка ${number}: вкажіть відстань`;
      if (!trip.goalId) return `Поїздка ${number}: оберіть ціль поїздки`;

      const goal = getGoal(trip.goalId);
      const systemCode = formatGoalCode(goal);

      if (systemCode === "additional_alarm_list") {
        const totalAdditional = toNumber(trip.ohCount) + toNumber(trip.partnerCount);

        if (totalAdditional <= 0) {
          return `Поїздка ${number}: вкажіть кількість дод. спрацювань`;
        }

        if (!trip.reasonId && !trip.customReasonText.trim()) {
          return `Поїздка ${number}: оберіть причину дод. спрацювань`;
        }
      }
    }

    return "";
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
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
      await updateManualShift(shiftId, {
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

      setSuccess("Зміну успішно оновлено");
    } catch (err: any) {
      setError(err.response?.data?.message || "Не вдалося оновити зміну");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Редагувати зміну</h1>
          <p>Зміна даних зміни, поїздок і спрацювань</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate("/reports/shifts")}
        >
          Повернутися до звіту
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Завантаження зміни...</div>
      ) : (
        <form className="manual-shift-form" onSubmit={handleSubmit}>
          <div className="panel-card">
            <h2>Основні дані зміни</h2>

            <div className="manual-form-grid">
              <label className="field">
                <span>Місто</span>
                <select
                  value={form.cityId}
                  onChange={(event) =>
                    updateForm("cityId", Number(event.target.value))
                  }
                >
                  <option value={0}>Оберіть місто</option>

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
                  <option value={0}>Оберіть наряд</option>

                  {filteredCrews.map((crew) => (
                    <option key={crew.id} value={crew.id}>
                      {crew.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Автомобіль</span>
                <select
                  value={form.vehicleId}
                  onChange={(event) =>
                    updateForm("vehicleId", Number(event.target.value))
                  }
                >
                  <option value={0}>Оберіть автомобіль</option>

                  {filteredVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.title}
                      {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Дата й час початку зміни</span>
                <input
                  type="datetime-local"
                  value={form.shiftDate}
                  onChange={(event) => updateForm("shiftDate", event.target.value)}
                />
              </label>

              <label className="field">
                <span>Час надсилання звіту</span>
                <input
                  type="datetime-local"
                  value={form.submittedAt}
                  onChange={(event) =>
                    updateForm("submittedAt", event.target.value)
                  }
                />
              </label>

              <label className="field">
                <span>Спідометр на початку</span>
                <input
                  type="number"
                  min="0"
                  value={form.odometerStart}
                  onChange={(event) =>
                    updateForm("odometerStart", event.target.value)
                  }
                />
              </label>

              <label className="field">
                <span>Спідометр наприкінці</span>
                <input value={odometerEnd || ""} disabled />
              </label>
            </div>

            <div className="manual-form-grid manual-form-grid-two">
              <div className="manual-person-card">
                <label className="field">
                  <span>Водій</span>
                  <select
                    value={form.driverEmployeeId}
                    onChange={(event) =>
                      updateForm(
                        "driverEmployeeId",
                        Number(event.target.value)
                      )
                    }
                  >
                    <option value={0}>Оберіть водія</option>

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
                  <span>Водій зі зброєю</span>
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
                    <option value={0}>Оберіть старшого</option>

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
                  <span>Старший зі зброєю</span>
                </label>
              </div>
            </div>
          </div>

          <div className="panel-card">
            <div className="table-header">
              <div>
                <h2>Поїздки</h2>
                <p>
                  Загальний пробіг: <strong>{totalDistanceKm.toFixed(1)} км</strong>
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={addTrip}
              >
                Додати поїздку
              </button>
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
                    <div className="manual-trip-card-header">
                      <h3>Поїздка {index + 1}</h3>

                      {trips.length > 1 && (
                        <button
                          type="button"
                          className="small-button danger-button"
                          onClick={() => removeTrip(index)}
                        >
                          Видалити
                        </button>
                      )}
                    </div>

                    <div className="manual-form-grid">
                      <label className="field">
                        <span>Звідки</span>
                        <input
                          value={trip.fromLocation}
                          onChange={(event) =>
                            updateTrip(index, "fromLocation", event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Час виїзду</span>
                        <input
                          type="datetime-local"
                          value={trip.departureTime}
                          onChange={(event) =>
                            updateTrip(index, "departureTime", event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Куди</span>
                        <input
                          value={trip.toLocation}
                          onChange={(event) =>
                            updateTrip(index, "toLocation", event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Час прибуття</span>
                        <input
                          type="datetime-local"
                          value={trip.arrivalTime}
                          onChange={(event) =>
                            updateTrip(index, "arrivalTime", event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Прибуття, хв</span>
                        <input
                          value={trip.arrivalMinutes}
                          disabled
                          placeholder="Автоматично"
                        />
                      </label>

                      <label className="field">
                        <span>Відстань, км</span>
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
                        <span>Ціль поїздки</span>
                        <select
                          value={trip.goalId}
                          onChange={(event) =>
                            updateTrip(index, "goalId", Number(event.target.value))
                          }
                        >
                          <option value={0}>Оберіть ціль</option>

                          {tripGoals.map((goalItem) => (
                            <option key={goalItem.id} value={goalItem.id}>
                              {goalItem.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Примітка</span>
                        <input
                          value={trip.note}
                          onChange={(event) =>
                            updateTrip(index, "note", event.target.value)
                          }
                        />
                      </label>
                    </div>

                    {isRegularAlarm && (
                      <div className="manual-event-box">
                        <h4>
                          {systemCode === "alarm_oh"
                            ? "Спрацювання ОХ"
                            : "Спрацювання партнерів"}
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
                              <option value="false">Хибна</option>
                              <option value="true">Бойова</option>
                            </select>
                          </label>

                          <label className="field">
                            <span>Затримано</span>
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
                        <h4>Список спрацювань</h4>

                        <div className="manual-form-grid">
                          <label className="field">
                            <span>Причина</span>
                            <select
                              value={trip.reasonId}
                              onChange={(event) =>
                                updateTrip(
                                  index,
                                  "reasonId",
                                  Number(event.target.value)
                                )
                              }
                            >
                              <option value={0}>Оберіть причину</option>

                              {reasons.map((reason) => (
                                <option key={reason.id} value={reason.id}>
                                  {reason.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field">
                            <span>Власна причина</span>
                            <input
                              value={trip.customReasonText}
                              onChange={(event) =>
                                updateTrip(
                                  index,
                                  "customReasonText",
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <label className="field">
                            <span>Кількість ОХ</span>
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
                            <span>Кількість партнерів</span>
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
                            <span>Затримано</span>
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
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}

          <div className="manual-submit-bar">
            <button className="primary-button" disabled={saving}>
              {saving ? "Зберігаємо..." : "Зберегти зміни"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}