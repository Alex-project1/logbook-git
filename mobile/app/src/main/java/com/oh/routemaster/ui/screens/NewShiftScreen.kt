package com.oh.routemaster.ui.screens



import androidx.compose.foundation.BorderStroke

import androidx.compose.foundation.clickable

import androidx.compose.foundation.layout.Arrangement

import androidx.compose.foundation.layout.Column

import androidx.compose.foundation.layout.Row

import androidx.compose.foundation.layout.fillMaxSize

import androidx.compose.foundation.layout.fillMaxWidth

import androidx.compose.foundation.layout.heightIn

import androidx.compose.foundation.layout.padding

import androidx.compose.foundation.rememberScrollState

import androidx.compose.foundation.text.KeyboardOptions

import androidx.compose.foundation.verticalScroll

import androidx.compose.material3.AlertDialog

import androidx.compose.material3.Button

import androidx.compose.material3.Card

import androidx.compose.material3.CardDefaults

import androidx.compose.material3.CircularProgressIndicator

import androidx.compose.material3.MaterialTheme

import androidx.compose.material3.OutlinedButton

import androidx.compose.material3.OutlinedTextField

import androidx.compose.material3.Switch

import androidx.compose.material3.Text

import androidx.compose.material3.TextButton

import androidx.compose.runtime.Composable

import androidx.compose.runtime.LaunchedEffect

import androidx.compose.runtime.getValue

import androidx.compose.runtime.mutableIntStateOf

import androidx.compose.runtime.mutableStateOf

import androidx.compose.runtime.remember

import androidx.compose.runtime.rememberCoroutineScope

import androidx.compose.runtime.setValue

import androidx.compose.ui.Alignment

import androidx.compose.ui.Modifier

import androidx.compose.ui.text.font.FontWeight

import androidx.compose.ui.text.input.KeyboardType

import androidx.compose.ui.unit.dp

import androidx.compose.ui.platform.LocalContext

import com.google.gson.Gson

import com.oh.routemaster.data.local.MobileBootstrapStore

import com.oh.routemaster.data.local.ShiftDraftStore

import com.oh.routemaster.data.local.PendingSubmissionItem

import com.oh.routemaster.data.local.PendingSubmissionStore

import com.oh.routemaster.data.local.PENDING_KIND_GBR_SHIFT

import com.oh.routemaster.data.local.PENDING_KIND_POST_DUTY

import com.oh.routemaster.data.remote.AdditionalAlarmReasonDto

import com.oh.routemaster.data.remote.ApiClient

import com.oh.routemaster.data.remote.BootstrapMobileUserDto

import com.oh.routemaster.data.remote.CreateMobileShiftRequest

import com.oh.routemaster.data.remote.CreateMobileShiftTripEventRequest

import com.oh.routemaster.data.remote.CreateMobileShiftTripRequest

import com.oh.routemaster.data.remote.CreatePostDutyMemberRequest

import com.oh.routemaster.data.remote.CreatePostDutyRequest

import com.oh.routemaster.data.remote.CrewDto

import com.oh.routemaster.data.remote.DutyPostDto

import com.oh.routemaster.data.remote.EmployeeDto

import com.oh.routemaster.data.remote.MobileBootstrapDto

import com.oh.routemaster.data.remote.TripGoalDto

import com.oh.routemaster.data.remote.VehicleDto

import kotlinx.coroutines.Dispatchers

import kotlinx.coroutines.delay

import kotlinx.coroutines.flow.firstOrNull

import kotlinx.coroutines.launch

import kotlinx.coroutines.withContext

import com.oh.routemaster.services.PendingSubmissionWorkScheduler

import retrofit2.HttpException

import java.text.SimpleDateFormat

import java.util.Date

import java.util.Locale

import java.io.IOException

import android.app.TimePickerDialog



private enum class ShiftKind {

    GBR,

    POST

}



private enum class PostDutyType(

    val label: String,

    val defaultHours: String

) {

    FULL_DAY("Добовий пост", "24"),

    DAY("Денний пост", "12"),

    NIGHT("Нічний пост", "12")

}





private const val TRIP_GOAL_ALARM_OH = "alarm_oh"

private const val TRIP_GOAL_ALARM_PARTNER = "alarm_partner"

private const val TRIP_GOAL_ADDITIONAL_ALARM_LIST = "additional_alarm_list"



private enum class RegularAlarmType(

    val label: String,

    val isCombat: Boolean

) {

    FALSE("Ложна", false),

    COMBAT("Бойова", true)

}



private data class SelectOption(

    val id: Int,

    val label: String

)



private data class TripDraft(

    val localId: Long,

    val goalId: Int,

    val fromLocation: String = "",

    val toLocation: String = "",

    val departureTime: String = "",

    val arrivalTime: String = "",

    val distanceKm: String = "",

    val note: String = "",

    val regularAlarmType: RegularAlarmType = RegularAlarmType.FALSE,

    val additionalReasonId: Int = 0,

    val customReasonText: String = "",

    val ohCount: String = "",

    val partnerCount: String = "",

    val detainedCount: String = "",

    val transferredCount: String = ""

)



private data class PostMemberDraft(

    val localId: Long,

    val employeeId: Int = 0,

    val hasWeapon: Boolean = false,

    val isDriver: Boolean = false,

    val comment: String = ""

)



private data class ShiftFormDraftSnapshot(

    val shiftKind: ShiftKind = ShiftKind.GBR,

    val mainSectionOpen: Boolean = true,

    val detailsSectionOpen: Boolean = false,

    val summarySectionOpen: Boolean = false,

    val scrollValue: Int = 0,



    val selectedCrewId: Int = 0,

    val selectedVehicleId: Int = 0,

    val selectedDriverId: Int = 0,

    val selectedSeniorId: Int = 0,

    val driverHasWeapon: Boolean = false,

    val seniorHasWeapon: Boolean = false,

    val shiftDate: String = "",

    val shiftTime: String = "",

    val odometerStart: String = "",



    val trips: List<TripDraft> = emptyList(),

    val openedTripId: Long? = null,

    val nextTripId: Long = 1L,



    val selectedPostId: Int = 0,

    val postVehicleId: Int = 0,

    val postDutyType: PostDutyType = PostDutyType.FULL_DAY,

    val postDate: String = "",

    val postTime: String = "",

    val postDurationHours: String = PostDutyType.FULL_DAY.defaultHours,

    val postNote: String = "",

    val postMembers: List<PostMemberDraft> = emptyList(),

    val nextPostMemberId: Long = 2L,



    val savedAt: Long = System.currentTimeMillis()

)



@Composable

fun NewShiftScreen(

    accessToken: String

) {

    val scope = rememberCoroutineScope()

    val context = LocalContext.current

    val bootstrapStore = remember { MobileBootstrapStore(context.applicationContext) }

    val draftStore = remember { ShiftDraftStore(context.applicationContext) }

    val pendingStore = remember { PendingSubmissionStore(context.applicationContext) }

    val gson = remember { Gson() }



    var bootstrap by remember { mutableStateOf<MobileBootstrapDto?>(null) }

    var loading by remember { mutableStateOf(true) }

    var error by remember { mutableStateOf("") }



    var shiftKind by remember { mutableStateOf(ShiftKind.GBR) }



    var mainSectionOpen by remember { mutableStateOf(true) }

    var detailsSectionOpen by remember { mutableStateOf(false) }

    var summarySectionOpen by remember { mutableStateOf(false) }



    var selectedCrewId by remember { mutableIntStateOf(0) }

    var selectedVehicleId by remember { mutableIntStateOf(0) }

    var selectedDriverId by remember { mutableIntStateOf(0) }

    var selectedSeniorId by remember { mutableIntStateOf(0) }



    var driverHasWeapon by remember { mutableStateOf(false) }

    var seniorHasWeapon by remember { mutableStateOf(false) }



    var shiftDate by remember { mutableStateOf(getCurrentDateInput()) }

    var shiftTime by remember { mutableStateOf(getCurrentTimeInput()) }

    var odometerStart by remember { mutableStateOf("") }



    var trips by remember { mutableStateOf<List<TripDraft>>(emptyList()) }

    var openedTripId by remember { mutableStateOf<Long?>(null) }

    var nextTripId by remember { mutableStateOf(1L) }



    var selectedPostId by remember { mutableIntStateOf(0) }

    var postVehicleId by remember { mutableIntStateOf(0) }

    var postDutyType by remember { mutableStateOf(PostDutyType.FULL_DAY) }

    var postDate by remember { mutableStateOf(getCurrentDateInput()) }

    var postTime by remember { mutableStateOf(getCurrentTimeInput()) }

    var postDurationHours by remember { mutableStateOf(PostDutyType.FULL_DAY.defaultHours) }

    var postNote by remember { mutableStateOf("") }



    var postMembers by remember {

        mutableStateOf(

            listOf(

                PostMemberDraft(localId = 1L)

            )

        )

    }

    var nextPostMemberId by remember { mutableStateOf(2L) }



    var postSaving by remember { mutableStateOf(false) }

    var postSaveSuccess by remember { mutableStateOf("") }

    var postSaveError by remember { mutableStateOf("") }



    var gbrSaving by remember { mutableStateOf(false) }

    var gbrSaveSuccess by remember { mutableStateOf("") }

    var gbrSaveError by remember { mutableStateOf("") }

    var gbrFormErrors by remember { mutableStateOf(GbrFormErrors()) }



    var successDialogOpen by remember { mutableStateOf(false) }

    var successDialogTitle by remember { mutableStateOf("") }

    var successDialogMessage by remember { mutableStateOf("") }

    var lastSavedKind by remember { mutableStateOf<ShiftKind?>(null) }



    var draftRestoreDecisionMade by remember { mutableStateOf(false) }

    var draftDialogOpen by remember { mutableStateOf(false) }

    var draftJsonToRestore by remember { mutableStateOf<String?>(null) }

    var draftStatus by remember { mutableStateOf("") }

    var pendingStatus by remember { mutableStateOf("") }

    var resetDialogOpen by remember { mutableStateOf(false) }

    var sendConfirmDialogKind by remember { mutableStateOf<ShiftKind?>(null) }



    val scrollState = rememberScrollState()

    var restoredScrollValue by remember { mutableStateOf<Int?>(null) }



    fun applyMobileUserDefaults(data: MobileBootstrapDto) {

        val mobileUser = data.mobileUser ?: return



        when (mobileUser.userKind) {

            "CREW" -> {

                shiftKind = ShiftKind.GBR

                selectedCrewId = mobileUser.crewId

                    ?: data.crews.firstOrNull()?.id

                    ?: 0

            }



            "POST" -> {

                shiftKind = ShiftKind.POST

                selectedPostId = mobileUser.dutyPostId

                    ?: data.dutyPosts.firstOrNull()?.id

                    ?: 0

            }

        }

    }



    suspend fun loadBootstrapFromCache() {

        loading = true

        error = ""



        try {

            val cachedBootstrap = withContext(Dispatchers.IO) {

                bootstrapStore.getBootstrap(gson)

            }



            if (cachedBootstrap == null) {

                bootstrap = null

                error = "Дані для зміни ще не збережені на телефоні. Підключіть інтернет і натисніть «Оновити дані» на головній сторінці."

                return

            }



            bootstrap = cachedBootstrap

            applyMobileUserDefaults(cachedBootstrap)

        } catch (exception: Exception) {

            bootstrap = null

            error = "Не вдалося відкрити локально збережені дані для зміни"

            exception.printStackTrace()

        } finally {

            loading = false

        }

    }



    fun updateTrip(localId: Long, update: (TripDraft) -> TripDraft) {

        trips = trips.map { trip ->

            if (trip.localId == localId) {

                update(trip)

            } else {

                trip

            }

        }



        if (gbrFormErrors.tripErrors.containsKey(localId)) {

            gbrFormErrors = gbrFormErrors.copy(

                tripErrors = gbrFormErrors.tripErrors - localId

            )

        }

    }



    fun addTrip(data: MobileBootstrapDto) {

        val previousTrip = trips.lastOrNull()

        val newTrip = TripDraft(

            localId = nextTripId,

            goalId = 0,

            fromLocation = previousTrip?.toLocation?.trim().orEmpty(),

            departureTime = getCurrentTimeInput()

        )



        trips = trips + newTrip

        openedTripId = newTrip.localId

        detailsSectionOpen = true

        nextTripId += 1

    }



    fun removeTrip(localId: Long) {

        trips = trips.filterNot { it.localId == localId }



        if (openedTripId == localId) {

            openedTripId = null

        }

    }



    fun updatePostMember(localId: Long, update: (PostMemberDraft) -> PostMemberDraft) {

        postMembers = postMembers.map { member ->

            if (member.localId == localId) {

                update(member)

            } else {

                member

            }

        }

    }



    fun addPostMember() {

        postMembers = postMembers + PostMemberDraft(localId = nextPostMemberId)

        nextPostMemberId += 1

    }



    fun removePostMember(localId: Long) {

        val nextMembers = postMembers.filterNot { it.localId == localId }



        postMembers = if (nextMembers.isEmpty()) {

            listOf(PostMemberDraft(localId = nextPostMemberId)).also {

                nextPostMemberId += 1

            }

        } else {

            nextMembers

        }

    }



    fun setPostDriver(localId: Long) {

        if (postVehicleId == 0) {

            return

        }



        postMembers = postMembers.map { member ->

            member.copy(isDriver = member.localId == localId)

        }

    }



    fun handlePostVehicleChange(vehicleId: Int) {

        postVehicleId = vehicleId



        if (vehicleId == 0) {

            postMembers = postMembers.map {

                it.copy(isDriver = false)

            }

        }

    }



    fun resetFormAfterSuccessfulSave(

        data: MobileBootstrapDto,

        keepKind: ShiftKind

    ) {

        shiftKind = keepKind



        selectedCrewId = 0

        selectedVehicleId = 0

        selectedDriverId = 0

        selectedSeniorId = 0



        driverHasWeapon = false

        seniorHasWeapon = false



        shiftDate = getCurrentDateInput()

        shiftTime = getCurrentTimeInput()

        odometerStart = ""



        trips = emptyList()

        openedTripId = null

        nextTripId = 1L



        selectedPostId = 0

        postVehicleId = 0

        postDutyType = PostDutyType.FULL_DAY

        postDate = getCurrentDateInput()

        postTime = getCurrentTimeInput()

        postDurationHours = PostDutyType.FULL_DAY.defaultHours

        postNote = ""



        postMembers = listOf(PostMemberDraft(localId = 1L))

        nextPostMemberId = 2L



        postSaveSuccess = ""

        postSaveError = ""

        gbrSaveSuccess = ""

        gbrSaveError = ""

        gbrFormErrors = GbrFormErrors()



        applyMobileUserDefaults(data)



        mainSectionOpen = true

        detailsSectionOpen = false

        summarySectionOpen = false

    }



    fun handlePostDutyTypeChange(type: PostDutyType) {

        postDutyType = type



        postDurationHours = when (type) {

            PostDutyType.FULL_DAY -> "24"

            PostDutyType.DAY -> if (postDurationHours == "24" || postDurationHours.isBlank()) {

                "12"

            } else {

                postDurationHours

            }



            PostDutyType.NIGHT -> if (postDurationHours == "24" || postDurationHours.isBlank()) {

                "12"

            } else {

                postDurationHours

            }

        }

    }



    fun buildDraftSnapshot(): ShiftFormDraftSnapshot {

        return ShiftFormDraftSnapshot(

            shiftKind = shiftKind,

            mainSectionOpen = mainSectionOpen,

            detailsSectionOpen = detailsSectionOpen,

            summarySectionOpen = summarySectionOpen,

            scrollValue = scrollState.value,

            selectedCrewId = selectedCrewId,

            selectedVehicleId = selectedVehicleId,

            selectedDriverId = selectedDriverId,

            selectedSeniorId = selectedSeniorId,

            driverHasWeapon = driverHasWeapon,

            seniorHasWeapon = seniorHasWeapon,

            shiftDate = shiftDate,

            shiftTime = shiftTime,

            odometerStart = odometerStart,

            trips = trips,

            openedTripId = openedTripId,

            nextTripId = nextTripId,

            selectedPostId = selectedPostId,

            postVehicleId = postVehicleId,

            postDutyType = postDutyType,

            postDate = postDate,

            postTime = postTime,

            postDurationHours = postDurationHours,

            postNote = postNote,

            postMembers = postMembers,

            nextPostMemberId = nextPostMemberId

        )

    }



    fun applyDraftSnapshot(snapshot: ShiftFormDraftSnapshot) {

        shiftKind = snapshot.shiftKind

        mainSectionOpen = snapshot.mainSectionOpen

        detailsSectionOpen = snapshot.detailsSectionOpen

        summarySectionOpen = snapshot.summarySectionOpen

        restoredScrollValue = snapshot.scrollValue.coerceAtLeast(0)



        selectedCrewId = snapshot.selectedCrewId

        selectedVehicleId = snapshot.selectedVehicleId

        selectedDriverId = snapshot.selectedDriverId

        selectedSeniorId = snapshot.selectedSeniorId

        driverHasWeapon = snapshot.driverHasWeapon

        seniorHasWeapon = snapshot.seniorHasWeapon

        shiftDate = snapshot.shiftDate.ifBlank { getCurrentDateInput() }

        shiftTime = snapshot.shiftTime.ifBlank { getCurrentTimeInput() }

        odometerStart = snapshot.odometerStart



        trips = snapshot.trips

        openedTripId = snapshot.openedTripId

        nextTripId = snapshot.nextTripId.coerceAtLeast(1L)



        selectedPostId = snapshot.selectedPostId

        postVehicleId = snapshot.postVehicleId

        postDutyType = snapshot.postDutyType

        postDate = snapshot.postDate.ifBlank { getCurrentDateInput() }

        postTime = snapshot.postTime.ifBlank { getCurrentTimeInput() }

        postDurationHours = snapshot.postDurationHours.ifBlank { PostDutyType.FULL_DAY.defaultHours }

        postNote = snapshot.postNote

        postMembers = snapshot.postMembers.ifEmpty { listOf(PostMemberDraft(localId = 1L)) }

        nextPostMemberId = snapshot.nextPostMemberId.coerceAtLeast(2L)



        postSaveSuccess = ""

        postSaveError = ""

        gbrSaveSuccess = ""

        gbrSaveError = ""

        gbrFormErrors = GbrFormErrors()



        bootstrap?.let { applyMobileUserDefaults(it) }

    }



    fun hasDraftContent(): Boolean {

        // Закріплені за логіном наряд/пост не вважаємо чернеткою самі по собі.

        // Інакше після кожного входу застосунок буде пропонувати відновити порожню чернетку.

        val hasGbrContent = selectedVehicleId > 0 ||

            selectedDriverId > 0 ||

            selectedSeniorId > 0 ||

            driverHasWeapon ||

            seniorHasWeapon ||

            odometerStart.isNotBlank() ||

            trips.isNotEmpty()



        val hasPostContent = postVehicleId > 0 ||

            postNote.isNotBlank() ||

            postMembers.any {

                it.employeeId > 0 || it.hasWeapon || it.isDriver || it.comment.isNotBlank()

            }



        return hasGbrContent || hasPostContent

    }



    suspend fun savePostDuty() {

        postSaveError = ""

        postSaveSuccess = ""



        val duration = postDurationHours.replace(",", ".").toDoubleOrNull()

        val validMembers = postMembers.filter { it.employeeId > 0 }

        val uniqueEmployeeIds = validMembers.map { it.employeeId }.toSet()



        when {

            selectedPostId == 0 -> {

                postSaveError = "Оберіть пост"

                summarySectionOpen = true

                return

            }



            postDate.isBlank() -> {

                postSaveError = "Вкажіть дату чергування"

                summarySectionOpen = true

                return

            }



            postTime.isBlank() -> {

                postSaveError = "Вкажіть час початку"

                summarySectionOpen = true

                return

            }



            parseTimeToMinutes(postTime) == null -> {

                postSaveError = "Некоректний час початку. Оберіть час у форматі 08:55"

                summarySectionOpen = true

                return

            }



            duration == null || duration <= 0.0 || duration > 24.0 -> {

                postSaveError = "Вкажіть тривалість від 0.25 до 24 годин"

                summarySectionOpen = true

                return

            }



            validMembers.isEmpty() -> {

                postSaveError = "Додайте хоча б одного співробітника"

                detailsSectionOpen = true

                summarySectionOpen = true

                return

            }



            uniqueEmployeeIds.size != validMembers.size -> {

                postSaveError = "Один співробітник не може бути доданий двічі"

                detailsSectionOpen = true

                summarySectionOpen = true

                return

            }



            postVehicleId != 0 && validMembers.count { it.isDriver } != 1 -> {

                postSaveError = "Якщо вибрано автомобіль, має бути рівно один водій"

                detailsSectionOpen = true

                summarySectionOpen = true

                return

            }

        }



        val body = CreatePostDutyRequest(

            postId = selectedPostId,

            vehicleId = postVehicleId.takeIf { it > 0 },

            dutyDate = buildIsoDateTime(postDate, postTime),

            durationHours = duration,

            note = postNote.trim().ifBlank { null },

            members = validMembers.map { member ->

                CreatePostDutyMemberRequest(

                    employeeId = member.employeeId,

                    hasWeapon = member.hasWeapon,

                    isDriver = if (postVehicleId > 0) member.isDriver else false,

                    comment = member.comment.trim().ifBlank { null }

                )

            }

        )



        postSaving = true



        try {

            val response = withContext(Dispatchers.IO) {

                ApiClient.api.createPostDuty(

                    authorization = "Bearer $accessToken",

                    body = body

                )

            }



            postSaveSuccess = "Постове чергування збережено"

            lastSavedKind = ShiftKind.POST

            successDialogTitle = "Постове чергування збережено"

            successDialogMessage = "Запис №${response.data.id} успішно відправлено в базу."

            successDialogOpen = true

            summarySectionOpen = true

        } catch (exception: IOException) {

            val title = "$postDate · ${findDutyPostLabel(bootstrap?.dutyPosts.orEmpty(), selectedPostId).ifBlank { "Пост" }}"



            withContext(Dispatchers.IO) {

                pendingStore.addPending(

                    PendingSubmissionItem(

                        id = createPendingId("post"),

                        kind = PENDING_KIND_POST_DUTY,

                        title = title,

                        createdAt = System.currentTimeMillis(),

                        bodyJson = gson.toJson(body)

                    ),

                    gson = gson

                )

            }



            PendingSubmissionWorkScheduler.enqueueNow(context.applicationContext)



            val pendingLeft = withContext(Dispatchers.IO) {

                pendingStore.getPending(gson).size

            }



            postSaveSuccess = "Немає зв’язку. Постове чергування збережено в чергу."

            pendingStatus = "Очікує відправки: $pendingLeft"

            lastSavedKind = ShiftKind.POST

            successDialogTitle = "Збережено в чергу"

            successDialogMessage = "Немає доступу до сервера. Постове чергування збережено на телефоні та буде відправлено пізніше."

            successDialogOpen = true

            summarySectionOpen = true

            exception.printStackTrace()

        } catch (exception: Exception) {

            postSaveError = "Не вдалося зберегти постове чергування: ${getApiErrorMessage(exception)}"

            summarySectionOpen = true

            exception.printStackTrace()

        } finally {

            postSaving = false

        }

    }



fun validateGbrForm(data: MobileBootstrapDto): GbrFormErrors {

        val tripErrors = trips.mapNotNull { trip ->

            val errors = getTripValidationErrors(

                trip = trip,

                tripGoals = data.tripGoals

            )



            if (errors.isEmpty()) {

                null

            } else {

                trip.localId to errors

            }

        }.toMap()



        return GbrFormErrors(

            crew = if (selectedCrewId == 0) "Оберіть наряд" else null,

            vehicle = if (selectedVehicleId == 0) "Оберіть автомобіль" else null,

            driver = when {

                selectedDriverId == 0 -> "Оберіть водія"

                selectedDriverId == selectedSeniorId && selectedSeniorId > 0 -> "Водій і старший не можуть бути одним співробітником"

                else -> null

            },

            senior = when {

                selectedSeniorId == 0 -> "Оберіть старшого наряду"

                selectedDriverId == selectedSeniorId && selectedDriverId > 0 -> "Водій і старший не можуть бути одним співробітником"

                else -> null

            },

            shiftDate = if (shiftDate.isBlank()) "Вкажіть дату зміни" else null,

            shiftTime = when {

                shiftTime.isBlank() -> "Вкажіть час початку"

                parseTimeToMinutes(shiftTime) == null -> "Некоректний час початку. Оберіть час у форматі 08:55"

                else -> null

            },

            odometerStart = when {

                odometerStart.isBlank() -> "Вкажіть початковий пробіг"

                odometerStart.toIntOrNull() == null -> "Пробіг має бути числом"

                odometerStart.toIntOrNull() != null && odometerStart.toInt() < 0 -> "Пробіг не може бути менше 0"

                else -> null

            },

            trips = if (trips.isEmpty()) "Додайте хоча б одну поїздку" else null,

            tripErrors = tripErrors

        )

    }



    fun buildGbrErrorMessage(errors: GbrFormErrors): String {

        val messages = mutableListOf<String>()



        errors.crew?.let { messages.add("Основні дані: $it") }

        errors.vehicle?.let { messages.add("Основні дані: $it") }

        errors.driver?.let { messages.add("Основні дані: $it") }

        errors.senior?.let { messages.add("Основні дані: $it") }

        errors.shiftDate?.let { messages.add("Основні дані: $it") }

        errors.shiftTime?.let { messages.add("Основні дані: $it") }

        errors.odometerStart?.let { messages.add("Основні дані: $it") }

        errors.trips?.let { messages.add("Маршрути / Поїздки: $it") }



        errors.tripErrors.forEach { (localId, tripMessages) ->

            val tripIndex = trips.indexOfFirst { it.localId == localId }

                .takeIf { it >= 0 }

                ?.plus(1)

                ?: 1



            tripMessages.forEach { message ->

                messages.add("Поїздка $tripIndex: $message")

            }

        }



        return messages.joinToString(separator = "\n")

    }



    suspend fun saveGbrShift() {

        val data = bootstrap ?: return



        gbrSaveError = ""

        gbrSaveSuccess = ""



        val formErrors = validateGbrForm(data)

        gbrFormErrors = formErrors



        if (formErrors.hasErrors) {

            gbrSaveError = buildGbrErrorMessage(formErrors)



            if (formErrors.hasMainErrors) {

                mainSectionOpen = true

            }



            if (formErrors.trips != null || formErrors.tripErrors.isNotEmpty()) {

                detailsSectionOpen = true

            }



            val firstTripError = formErrors.tripErrors.entries.firstOrNull()

            if (firstTripError != null) {

                openedTripId = firstTripError.key

            }



            summarySectionOpen = true

            return

        }



        val odometer = odometerStart.toInt()



        val body = CreateMobileShiftRequest(

            localShiftId = createLocalShiftId(),

            crewId = selectedCrewId,

            vehicleId = selectedVehicleId,

            driverEmployeeId = selectedDriverId,

            driverHasWeapon = driverHasWeapon,

            seniorEmployeeId = selectedSeniorId,

            seniorHasWeapon = seniorHasWeapon,

            shiftDate = buildIsoDateTime(shiftDate, shiftTime),

            odometerStart = odometer,

            trips = trips.map { trip ->

                CreateMobileShiftTripRequest(

                    fromLocation = trip.fromLocation.trim(),

                    departureTime = buildIsoDateTime(shiftDate, trip.departureTime),

                    toLocation = trip.toLocation.trim(),

                    arrivalTime = buildIsoDateTime(shiftDate, trip.arrivalTime),

                    distanceKm = trip.distanceKm.replace(",", ".").toDouble(),

                    goalId = trip.goalId,

                    note = trip.note.trim().ifBlank { null },

                    events = buildTripEvents(

                        trip = trip,

                        tripGoals = data.tripGoals

                    )

                )

            }

        )



        gbrSaving = true



        try {

            val response = withContext(Dispatchers.IO) {

                ApiClient.api.createMobileShift(

                    authorization = "Bearer $accessToken",

                    body = body

                )

            }



            gbrSaveSuccess = if (response.duplicated) {

                "Наряд вже був збережений раніше"

            } else {

                "Наряд ГШР збережено. Пробіг по поїздках: ${response.data.totalDistanceKm} км"

            }



            lastSavedKind = ShiftKind.GBR

            successDialogTitle = if (response.duplicated) {

                "Наряд вже збережений"

            } else {

                "Наряд ГШР збережено"

            }

            successDialogMessage = if (response.duplicated) {

                "Цей наряд вже був збережений раніше."

            } else {

                "Запис №${response.data.id} успішно відправлено в базу. Пробіг по поїздках: ${response.data.totalDistanceKm} км."

            }

            successDialogOpen = true

            summarySectionOpen = true

        } catch (exception: IOException) {

            val title = "$shiftDate · ${findCrewLabel(data.crews, selectedCrewId).ifBlank { "Наряд ГШР" }}"



            withContext(Dispatchers.IO) {

                pendingStore.addPending(

                    PendingSubmissionItem(

                        id = createPendingId("gbr"),

                        kind = PENDING_KIND_GBR_SHIFT,

                        title = title,

                        createdAt = System.currentTimeMillis(),

                        bodyJson = gson.toJson(body)

                    ),

                    gson = gson

                )

            }



            PendingSubmissionWorkScheduler.enqueueNow(context.applicationContext)



            val pendingLeft = withContext(Dispatchers.IO) {

                pendingStore.getPending(gson).size

            }



            gbrSaveSuccess = "Немає зв’язку. Наряд ГШР збережено в чергу."

            pendingStatus = "Очікує відправки: $pendingLeft"

            lastSavedKind = ShiftKind.GBR

            successDialogTitle = "Збережено в чергу"

            successDialogMessage = "Немає доступу до сервера. Наряд ГШР збережено на телефоні та буде відправлено пізніше."

            successDialogOpen = true

            summarySectionOpen = true

            exception.printStackTrace()

        } catch (exception: Exception) {

            gbrSaveError = "Не вдалося зберегти наряд ГШР: ${getApiErrorMessage(exception)}"

            summarySectionOpen = true

            exception.printStackTrace()

        } finally {

            gbrSaving = false

        }

    }





    LaunchedEffect(Unit) {

        loadBootstrapFromCache()

    }




    LaunchedEffect(Unit) {

        val existingDraft = draftStore.draftFlow.firstOrNull()



        if (!existingDraft.isNullOrBlank()) {

            try {

                val snapshot = gson.fromJson(

                    existingDraft,

                    ShiftFormDraftSnapshot::class.java

                )



                applyDraftSnapshot(snapshot)

                draftStatus = "Чернетку автоматично відновлено"

            } catch (exception: Exception) {

                draftStatus = "Не вдалося відновити чернетку"

                exception.printStackTrace()

            }

        }



        draftJsonToRestore = null

        draftDialogOpen = false

        draftRestoreDecisionMade = true

    }



    LaunchedEffect(

        restoredScrollValue,

        loading

    ) {

        val targetScrollValue = restoredScrollValue



        if (targetScrollValue != null && !loading) {

            delay(300)

            scrollState.scrollTo(targetScrollValue.coerceAtMost(scrollState.maxValue))

            restoredScrollValue = null

        }

    }



    LaunchedEffect(

        draftRestoreDecisionMade,

        shiftKind,

        selectedCrewId,

        selectedVehicleId,

        selectedDriverId,

        selectedSeniorId,

        driverHasWeapon,

        seniorHasWeapon,

        shiftDate,

        shiftTime,

        odometerStart,

        trips,

        openedTripId,

        nextTripId,

        selectedPostId,

        postVehicleId,

        postDutyType,

        postDate,

        postTime,

        postDurationHours,

        postNote,

        postMembers,

        nextPostMemberId,

        scrollState.value

    ) {

        if (!draftRestoreDecisionMade) {

            return@LaunchedEffect

        }



        delay(700)



        if (hasDraftContent()) {

            draftStore.saveDraft(gson.toJson(buildDraftSnapshot()))

            draftStatus = "Чернетку збережено"

        } else {

            draftStore.clearDraft()

            draftStatus = ""

        }

    }



    Column(

        modifier = Modifier

            .fillMaxSize()

            .verticalScroll(scrollState)

            .padding(20.dp),

        verticalArrangement = Arrangement.spacedBy(16.dp)

    ) {

        Text(

            text = "Нова зміна",

            style = MaterialTheme.typography.headlineSmall

        )



        if (draftStatus.isNotBlank()) {

            Text(

                text = draftStatus,

                color = MaterialTheme.colorScheme.onSurfaceVariant,

                style = MaterialTheme.typography.bodySmall

            )

        }



        if (pendingStatus.isNotBlank()) {

            Text(

                text = pendingStatus,

                color = MaterialTheme.colorScheme.primary,

                style = MaterialTheme.typography.bodySmall

            )

        }



        when {

            loading -> {

                LoadingCard()

            }



            error.isNotBlank() -> {

                ErrorCard(

                    message = error,

                    onRetry = {

                        scope.launch {

                            loadBootstrapFromCache()

                        }

                    }

                )

            }



            bootstrap == null -> {

                ErrorCard(

                    message = "Дані не завантажено",

                    onRetry = {

                        scope.launch {

                            loadBootstrapFromCache()

                        }

                    }

                )

            }



            else -> {

                val data = bootstrap!!



                AccordionSection(

                    title = "Основні дані",

                    subtitle = when (shiftKind) {

                        ShiftKind.GBR -> "${data.city.name} · наряд, авто, співробітники, дата і пробіг"

                        ShiftKind.POST -> "${data.city.name} · пост, години, авто і співробітники"

                    },

                    open = mainSectionOpen,

                    onToggle = { mainSectionOpen = !mainSectionOpen }

                ) {

                    Column(

                        verticalArrangement = Arrangement.spacedBy(14.dp)

                    ) {

                        if (data.mobileUser?.userKind == "CREW" || data.mobileUser?.userKind == "POST") {

                            FixedShiftKindCard(

                                mobileUser = data.mobileUser

                            )

                        } else {

                            ShiftKindSelector(

                                selected = shiftKind,

                                onSelect = { selected ->

                                    shiftKind = selected

                                    postSaveError = ""

                                    postSaveSuccess = ""

                                    gbrSaveError = ""

                                    gbrSaveSuccess = ""

                                    gbrFormErrors = GbrFormErrors()

                                }

                            )

                        }



                        if (shiftKind == ShiftKind.GBR) {

                            GbrMainFields(

                                data = data,

                                errors = gbrFormErrors,

                                selectedCrewId = selectedCrewId,

                                selectedVehicleId = selectedVehicleId,

                                selectedDriverId = selectedDriverId,

                                selectedSeniorId = selectedSeniorId,

                                crewLocked = data.mobileUser?.userKind == "CREW",

                                driverHasWeapon = driverHasWeapon,

                                seniorHasWeapon = seniorHasWeapon,

                                shiftDate = shiftDate,

                                shiftTime = shiftTime,

                                odometerStart = odometerStart,

                                onCrewChange = {

                                    selectedCrewId = it.id

                                    gbrFormErrors = gbrFormErrors.copy(crew = null)

                                },

                                onVehicleChange = {

                                    selectedVehicleId = it.id

                                    gbrFormErrors = gbrFormErrors.copy(vehicle = null)

                                },

                                onDriverChange = {

                                    selectedDriverId = it.id

                                    gbrFormErrors = gbrFormErrors.copy(driver = null, senior = null)

                                },

                                onSeniorChange = {

                                    selectedSeniorId = it.id

                                    gbrFormErrors = gbrFormErrors.copy(driver = null, senior = null)

                                },

                                onDriverWeaponChange = { driverHasWeapon = it },

                                onSeniorWeaponChange = { seniorHasWeapon = it },

                                onShiftDateChange = {

                                    shiftDate = it

                                    gbrFormErrors = gbrFormErrors.copy(shiftDate = null)

                                },

                                onShiftTimeChange = {

                                    shiftTime = it

                                    gbrFormErrors = gbrFormErrors.copy(shiftTime = null)

                                },

                                onOdometerStartChange = { value ->

                                    odometerStart = value.filter { it.isDigit() }

                                    gbrFormErrors = gbrFormErrors.copy(odometerStart = null)

                                }

                            )

                        } else {

                            PostMainFields(

                                data = data,

                                selectedPostId = selectedPostId,

                                postLocked = data.mobileUser?.userKind == "POST",

                                postVehicleId = postVehicleId,

                                postDutyType = postDutyType,

                                postDate = postDate,

                                postTime = postTime,

                                postDurationHours = postDurationHours,

                                postNote = postNote,

                                onPostChange = { selectedPostId = it.id },

                                onVehicleChange = { handlePostVehicleChange(it.id) },

                                onPostDutyTypeChange = { handlePostDutyTypeChange(it) },

                                onDateChange = { postDate = it },

                                onTimeChange = { postTime = it },

                                onDurationChange = { value ->

                                    postDurationHours = value.filter { char ->

                                        char.isDigit() || char == '.' || char == ','

                                    }

                                },

                                onNoteChange = { postNote = it }

                            )

                        }

                    }

                }



                AccordionSection(

                    title = if (shiftKind == ShiftKind.GBR) {

                        "Маршрути / Поїздки"

                    } else {

                        "Співробітники поста"

                    },

                    subtitle = if (shiftKind == ShiftKind.GBR) {

                        buildGbrTripsSectionSubtitle(
                            trips = trips,
                            odometerStart = odometerStart
                        )

                    } else {

                        "Додано співробітників: ${postMembers.count { it.employeeId > 0 }}"

                    },

                    open = detailsSectionOpen,

                    onToggle = { detailsSectionOpen = !detailsSectionOpen }

                ) {

                    if (shiftKind == ShiftKind.GBR) {

                        TripsSection(

                            trips = trips,

                            odometerStart = odometerStart,

                            tripErrors = gbrFormErrors.tripErrors,

                            tripGoals = data.tripGoals,

                            additionalAlarmReasons = data.additionalAlarmReasons,

                            openedTripId = openedTripId,

                            onOpenTripChange = { openedTripId = it },

                            onAddTrip = { addTrip(data) },

                            onUpdateTrip = ::updateTrip,

                            onRemoveTrip = ::removeTrip

                        )

                    } else {

                        PostMembersSection(

                            members = postMembers,

                            employees = data.employees,

                            vehicleSelected = postVehicleId > 0,

                            onUpdateMember = ::updatePostMember,

                            onSetDriver = ::setPostDriver,

                            onAddMember = ::addPostMember,

                            onRemoveMember = ::removePostMember

                        )

                    }

                }



                AccordionSection(

                    title = "Перевірка зміни",

                    subtitle = "Перевірте заповнені дані перед відправкою",

                    open = summarySectionOpen,

                    onToggle = { summarySectionOpen = !summarySectionOpen }

                ) {

                    if (shiftKind == ShiftKind.GBR) {

                        GbrSummaryCard(

                            crew = findCrewLabel(data.crews, selectedCrewId),

                            vehicle = findVehicleLabel(data.vehicles, selectedVehicleId),

                            driver = findEmployeeLabel(data.employees, selectedDriverId),

                            senior = findEmployeeLabel(data.employees, selectedSeniorId),

                            shiftDate = shiftDate,

                            shiftTime = shiftTime,

                            odometerStart = odometerStart,

                            tripDistanceKm = calculateTripsDistanceKm(trips),

                            driverHasWeapon = driverHasWeapon,

                            seniorHasWeapon = seniorHasWeapon,

                            tripsCount = trips.size,

                            trips = trips,

                            tripGoals = data.tripGoals,

                            additionalAlarmReasons = data.additionalAlarmReasons,

                            gbrSaveSuccess = gbrSaveSuccess,

                            gbrSaveError = gbrSaveError,

                            saving = gbrSaving,

                            onSave = {

                                sendConfirmDialogKind = ShiftKind.GBR

                            }

                        )

                    } else {

                        PostSummaryCard(

                            post = findDutyPostLabel(data.dutyPosts, selectedPostId),

                            vehicle = if (postVehicleId == 0) {

                                "Без автомобіля"

                            } else {

                                findVehicleLabel(data.vehicles, postVehicleId)

                            },

                            dutyType = postDutyType.label,

                            postDate = postDate,

                            postTime = postTime,

                            durationHours = postDurationHours,

                            members = postMembers,

                            employees = data.employees,

                            postSaveSuccess = postSaveSuccess,

                            postSaveError = postSaveError,

                            saving = postSaving,

                            onSave = {

                                sendConfirmDialogKind = ShiftKind.POST

                            }

                        )

                    }

                }

            }

        }

        OutlinedButton(

            onClick = { resetDialogOpen = true },

            modifier = Modifier.fillMaxWidth()

        ) {

            Text("Видалити всі дані")

        }

    }



    if (resetDialogOpen) {

        ResetShiftDialog(

            onConfirm = {

                val data = bootstrap



                resetDialogOpen = false

                draftDialogOpen = false

                draftJsonToRestore = null

                draftStatus = ""

                gbrSaveError = ""

                gbrSaveSuccess = ""

                postSaveError = ""

                postSaveSuccess = ""



                if (data != null) {

                    resetFormAfterSuccessfulSave(

                        data = data,

                        keepKind = shiftKind

                    )

                }



                scope.launch {

                    draftStore.clearDraft()

                    scrollState.scrollTo(0)

                }

            },

            onDismiss = {

                resetDialogOpen = false

            }

        )

    }



    sendConfirmDialogKind?.let { confirmKind ->

        SendReportConfirmDialog(

            kind = confirmKind,

            onConfirm = {

                sendConfirmDialogKind = null

                scope.launch {

                    when (confirmKind) {

                        ShiftKind.GBR -> saveGbrShift()

                        ShiftKind.POST -> savePostDuty()

                    }

                }

            },

            onDismiss = {

                sendConfirmDialogKind = null

            }

        )

    }



    if (postSaving || gbrSaving) {

        SavingDialog(

            text = if (shiftKind == ShiftKind.POST) {

                "Зберігаємо постове чергування..."

            } else {

                "Зберігаємо наряд ГШР..."

            }

        )

    }



    if (successDialogOpen) {

        SaveResultDialog(

            title = successDialogTitle,

            message = successDialogMessage,

            onOk = {

                val data = bootstrap



                successDialogOpen = false

                draftStatus = ""



                scope.launch {

                    draftStore.clearDraft()

                }



                if (data != null) {

                    resetFormAfterSuccessfulSave(

                        data = data,

                        keepKind = lastSavedKind ?: ShiftKind.GBR

                    )

                }

            }

        )

    }

}



private data class GbrFormErrors(

    val crew: String? = null,

    val vehicle: String? = null,

    val driver: String? = null,

    val senior: String? = null,

    val shiftDate: String? = null,

    val shiftTime: String? = null,

    val odometerStart: String? = null,

    val trips: String? = null,

    val tripErrors: Map<Long, List<String>> = emptyMap()

) {

    val hasErrors: Boolean

        get() = listOf(

            crew,

            vehicle,

            driver,

            senior,

            shiftDate,

            shiftTime,

            odometerStart,

            trips

        ).any { it != null } || tripErrors.isNotEmpty()



    val hasMainErrors: Boolean

        get() = listOf(

            crew,

            vehicle,

            driver,

            senior,

            shiftDate,

            shiftTime,

            odometerStart

        ).any { it != null }

}





@Composable

private fun ShiftKindSelector(

    selected: ShiftKind,

    onSelect: (ShiftKind) -> Unit

) {

    Row(

        modifier = Modifier.fillMaxWidth(),

        horizontalArrangement = Arrangement.spacedBy(10.dp)

    ) {

        if (selected == ShiftKind.GBR) {

            Button(

                onClick = { onSelect(ShiftKind.GBR) },

                modifier = Modifier.weight(1f)

            ) {

                Text("Наряд ГШР")

            }

        } else {

            OutlinedButton(

                onClick = { onSelect(ShiftKind.GBR) },

                modifier = Modifier.weight(1f)

            ) {

                Text("Наряд ГШР")

            }

        }



        if (selected == ShiftKind.POST) {

            Button(

                onClick = { onSelect(ShiftKind.POST) },

                modifier = Modifier.weight(1f)

            ) {

                Text("Пост")

            }

        } else {

            OutlinedButton(

                onClick = { onSelect(ShiftKind.POST) },

                modifier = Modifier.weight(1f)

            ) {

                Text("Пост")

            }

        }

    }

}



@Composable

private fun FixedShiftKindCard(

    mobileUser: BootstrapMobileUserDto

) {

    val title = when (mobileUser.userKind) {

        "CREW" -> "Наряд ГШР"

        "POST" -> "Пост"

        else -> "Зміна"

    }



    val value = when (mobileUser.userKind) {

        "CREW" -> mobileUser.crew?.name

        "POST" -> mobileUser.dutyPost?.name

        else -> null

    }.orEmpty().ifBlank {

        mobileUser.displayName.orEmpty().ifBlank { mobileUser.login }

    }



    LockedInfoField(

        label = title,

        value = value,

        helper = "Тип зміни визначено вашим логіном. Змінити наряд або пост у застосунку не можна."

    )

}



@Composable

private fun LockedInfoField(

    label: String,

    value: String,

    helper: String? = null

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.medium,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surfaceVariant

        ),

        border = BorderStroke(

            width = 1.dp,

            color = MaterialTheme.colorScheme.outline

        )

    ) {

        Column(

            modifier = Modifier.padding(14.dp),

            verticalArrangement = Arrangement.spacedBy(5.dp)

        ) {

            Text(

                text = label,

                style = MaterialTheme.typography.labelLarge,

                color = MaterialTheme.colorScheme.onSurfaceVariant

            )



            Text(

                text = value.ifBlank { "Не вибрано" },

                style = MaterialTheme.typography.bodyLarge,

                fontWeight = FontWeight.SemiBold

            )



            if (!helper.isNullOrBlank()) {

                Text(

                    text = helper,

                    style = MaterialTheme.typography.bodySmall,

                    color = MaterialTheme.colorScheme.onSurfaceVariant

                )

            }

        }

    }

}



@Composable

private fun GbrMainFields(

    data: MobileBootstrapDto,

    errors: GbrFormErrors,

    selectedCrewId: Int,

    selectedVehicleId: Int,

    selectedDriverId: Int,

    selectedSeniorId: Int,

    crewLocked: Boolean,

    driverHasWeapon: Boolean,

    seniorHasWeapon: Boolean,

    shiftDate: String,

    shiftTime: String,

    odometerStart: String,

    onCrewChange: (SelectOption) -> Unit,

    onVehicleChange: (SelectOption) -> Unit,

    onDriverChange: (SelectOption) -> Unit,

    onSeniorChange: (SelectOption) -> Unit,

    onDriverWeaponChange: (Boolean) -> Unit,

    onSeniorWeaponChange: (Boolean) -> Unit,

    onShiftDateChange: (String) -> Unit,

    onShiftTimeChange: (String) -> Unit,

    onOdometerStartChange: (String) -> Unit

) {

    if (crewLocked) {

        LockedInfoField(

            label = "Наряд",

            value = findCrewLabel(data.crews, selectedCrewId).ifBlank { "Закріплений наряд" },

            helper = "Наряд закріплено за вашим логіном"

        )

    } else {

        SelectField(

            label = "Наряд",

            selectedLabel = findCrewLabel(data.crews, selectedCrewId),

            options = data.crews.map {

                SelectOption(

                    id = it.id,

                    label = it.name

                )

            },

            error = errors.crew,

            onSelect = onCrewChange

        )

    }



    SelectField(

        label = "Автомобіль",

        selectedLabel = findVehicleLabel(data.vehicles, selectedVehicleId),

        options = data.vehicles.map {

            SelectOption(

                id = it.id,

                label = "${it.title} · ${it.licensePlate.orEmpty()}"

            )

        },

        error = errors.vehicle,

        onSelect = onVehicleChange

    )



    SelectField(

        label = "Водій",

        selectedLabel = findEmployeeLabel(data.employees, selectedDriverId),

        options = data.employees.map {

            SelectOption(

                id = it.id,

                label = it.fullName

            )

        },

        error = errors.driver,

        onSelect = onDriverChange

    )



    WeaponSwitchRow(

        title = "Зброя у водія",

        checked = driverHasWeapon,

        onCheckedChange = onDriverWeaponChange

    )



    SelectField(

        label = "Старший наряду",

        selectedLabel = findEmployeeLabel(data.employees, selectedSeniorId),

        options = data.employees.map {

            SelectOption(

                id = it.id,

                label = it.fullName

            )

        },

        error = errors.senior,

        onSelect = onSeniorChange

    )



    WeaponSwitchRow(

        title = "Зброя у старшого",

        checked = seniorHasWeapon,

        onCheckedChange = onSeniorWeaponChange

    )



    OutlinedTextField(

        value = shiftDate,

        onValueChange = onShiftDateChange,

        modifier = Modifier.fillMaxWidth(),

        label = { Text("Дата зміни") },

        placeholder = { Text("2026-06-01") },

        singleLine = true,

        isError = errors.shiftDate != null,

        supportingText = {

            errors.shiftDate?.let {

                Text(it)

            }

        }

    )



    TimeSelectField(

        value = shiftTime,

        label = "Час початку",

        onTimeSelected = onShiftTimeChange

    )



    errors.shiftTime?.let {

        Text(

            text = it,

            color = MaterialTheme.colorScheme.error,

            style = MaterialTheme.typography.bodySmall

        )

    }



    OutlinedTextField(

        value = odometerStart,

        onValueChange = onOdometerStartChange,

        modifier = Modifier.fillMaxWidth(),

        label = { Text("Початковий пробіг") },

        placeholder = { Text("Наприклад: 125000") },

        singleLine = true,

        keyboardOptions = KeyboardOptions(

            keyboardType = KeyboardType.Number

        ),

        isError = errors.odometerStart != null,

        supportingText = {

            errors.odometerStart?.let {

                Text(it)

            }

        }

    )

}



@Composable

private fun PostMainFields(

    data: MobileBootstrapDto,

    selectedPostId: Int,

    postLocked: Boolean,

    postVehicleId: Int,

    postDutyType: PostDutyType,

    postDate: String,

    postTime: String,

    postDurationHours: String,

    postNote: String,

    onPostChange: (SelectOption) -> Unit,

    onVehicleChange: (SelectOption) -> Unit,

    onPostDutyTypeChange: (PostDutyType) -> Unit,

    onDateChange: (String) -> Unit,

    onTimeChange: (String) -> Unit,

    onDurationChange: (String) -> Unit,

    onNoteChange: (String) -> Unit

) {

    if (postLocked) {

        LockedInfoField(

            label = "Пост",

            value = findDutyPostLabel(data.dutyPosts, selectedPostId).ifBlank { "Закріплений пост" },

            helper = "Пост закріплено за вашим логіном"

        )

    } else {

        SelectField(

            label = "Пост",

            selectedLabel = findDutyPostLabel(data.dutyPosts, selectedPostId),

            options = data.dutyPosts.map {

                SelectOption(

                    id = it.id,

                    label = it.name

                )

            },

            onSelect = onPostChange

        )

    }



    SelectField(

        label = "Тип поста",

        selectedLabel = postDutyType.label,

        options = PostDutyType.entries.mapIndexed { index, type ->

            SelectOption(

                id = index,

                label = type.label

            )

        },

        onSelect = { option ->

            val selectedType = PostDutyType.entries[option.id]

            onPostDutyTypeChange(selectedType)

        }

    )



    OutlinedTextField(

        value = postDate,

        onValueChange = onDateChange,

        modifier = Modifier.fillMaxWidth(),

        label = { Text("Дата чергування") },

        placeholder = { Text("2026-06-01") },

        singleLine = true

    )



    TimeSelectField(

        value = postTime,

        label = "Час початку",

        onTimeSelected = onTimeChange

    )



    OutlinedTextField(

        value = postDurationHours,

        onValueChange = onDurationChange,

        modifier = Modifier.fillMaxWidth(),

        label = { Text("Тривалість, годин") },

        placeholder = { Text("24") },

        singleLine = true,

        enabled = true,

        keyboardOptions = KeyboardOptions(

            keyboardType = KeyboardType.Decimal

        )

    )



    Text(

        text = "Еквівалент зміни: ${calculateShiftEquivalentLabel(postDurationHours)}",

        color = MaterialTheme.colorScheme.onSurfaceVariant

    )



    SelectField(

        label = "Автомобіль",

        selectedLabel = if (postVehicleId == 0) {

            "Без автомобіля"

        } else {

            findVehicleLabel(data.vehicles, postVehicleId)

        },

        options = listOf(

            SelectOption(

                id = 0,

                label = "Без автомобіля"

            )

        ) + data.vehicles.map {

            SelectOption(

                id = it.id,

                label = "${it.title} · ${it.licensePlate.orEmpty()}"

            )

        },

        onSelect = onVehicleChange

    )



    OutlinedTextField(

        value = postNote,

        onValueChange = onNoteChange,

        modifier = Modifier.fillMaxWidth(),

        label = { Text("Коментар") },

        placeholder = { Text("Необов’язково") },

        minLines = 2

    )

}



@Composable

private fun TripsSection(

    trips: List<TripDraft>,

    odometerStart: String,

    tripErrors: Map<Long, List<String>>,

    tripGoals: List<TripGoalDto>,

    additionalAlarmReasons: List<AdditionalAlarmReasonDto>,

    openedTripId: Long?,

    onOpenTripChange: (Long?) -> Unit,

    onAddTrip: () -> Unit,

    onUpdateTrip: (Long, (TripDraft) -> TripDraft) -> Unit,

    onRemoveTrip: (Long) -> Unit

) {

    Column(

        verticalArrangement = Arrangement.spacedBy(12.dp)

    ) {

        if (trips.isEmpty()) {

            Text(

                text = "Додайте першу поїздку. Кожна поїздка відкривається окремою карткою.",

                color = MaterialTheme.colorScheme.onSurfaceVariant

            )

        }



        trips.forEachIndexed { index, trip ->

            TripAccordionCard(

                index = index,

                trip = trip,

                tripGoals = tripGoals,

                additionalAlarmReasons = additionalAlarmReasons,

                validationErrors = tripErrors[trip.localId].orEmpty(),

                open = openedTripId == trip.localId,

                onToggle = {

                    onOpenTripChange(

                        if (openedTripId == trip.localId) null else trip.localId

                    )

                },

                onChangeGoal = { option ->

                    onUpdateTrip(trip.localId) {

                        it.copy(goalId = option.id)

                    }

                },

                onChangeFrom = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(fromLocation = value)

                    }

                },

                onChangeTo = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(toLocation = value)

                    }

                },

                onChangeDepartureTime = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(departureTime = value)

                    }

                },

                onChangeArrivalTime = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(arrivalTime = value)

                    }

                },

                onChangeDistance = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(

                            distanceKm = value.filter { char ->

                                char.isDigit() || char == '.' || char == ','

                            }

                        )

                    }

                },

                onChangeNote = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(note = value)

                    }

                },

                onChangeRegularAlarmType = { type ->

                    onUpdateTrip(trip.localId) {

                        it.copy(regularAlarmType = type)

                    }

                },

                onChangeAdditionalReason = { option ->

                    onUpdateTrip(trip.localId) {

                        it.copy(additionalReasonId = option.id)

                    }

                },

                onChangeCustomReason = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(customReasonText = value)

                    }

                },

                onChangeOhCount = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(ohCount = value.filterDigitsOnly())

                    }

                },

                onChangePartnerCount = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(partnerCount = value.filterDigitsOnly())

                    }

                },

                onChangeDetainedCount = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(detainedCount = value.filterDigitsOnly())

                    }

                },

                onChangeTransferredCount = { value ->

                    onUpdateTrip(trip.localId) {

                        it.copy(transferredCount = value.filterDigitsOnly())

                    }

                },

                onDelete = {

                    onRemoveTrip(trip.localId)

                }

            )

        }



        if (trips.isNotEmpty()) {

            val tripDistanceKm = calculateTripsDistanceKm(trips)

            val odometerStartNumber = odometerStart.toDoubleOrNull()

            val odometerEndLabel = if (odometerStartNumber == null) {

                "Не вказано"

            } else {

                "${formatDistanceValue(odometerStartNumber + tripDistanceKm)} км"

            }



            Card(

                modifier = Modifier.fillMaxWidth(),

                shape = MaterialTheme.shapes.medium,

                colors = CardDefaults.cardColors(

                    containerColor = MaterialTheme.colorScheme.surface

                ),

                border = BorderStroke(

                    width = 1.dp,

                    color = MaterialTheme.colorScheme.outline

                )

            ) {

                Column(

                    modifier = Modifier.padding(14.dp),

                    verticalArrangement = Arrangement.spacedBy(6.dp)

                ) {

                    Text(

                        text = "Підсумок маршрутів",

                        style = MaterialTheme.typography.titleSmall,

                        fontWeight = FontWeight.SemiBold

                    )



                    Text("Спідометр кінець: $odometerEndLabel")

                    Text("Поточний пробіг: ${formatDistanceValue(tripDistanceKm)} км")

                }

            }

        }



        Button(

            onClick = onAddTrip,

            modifier = Modifier.fillMaxWidth()

        ) {

            Text("Додати поїздку")

        }

    }

}



@Composable

private fun PostMembersSection(

    members: List<PostMemberDraft>,

    employees: List<EmployeeDto>,

    vehicleSelected: Boolean,

    onUpdateMember: (Long, (PostMemberDraft) -> PostMemberDraft) -> Unit,

    onSetDriver: (Long) -> Unit,

    onAddMember: () -> Unit,

    onRemoveMember: (Long) -> Unit

) {

    Column(

        verticalArrangement = Arrangement.spacedBy(12.dp)

    ) {

        members.forEachIndexed { index, member ->

            PostMemberCard(

                index = index,

                member = member,

                employees = employees,

                vehicleSelected = vehicleSelected,

                onEmployeeChange = { option ->

                    onUpdateMember(member.localId) {

                        it.copy(employeeId = option.id)

                    }

                },

                onWeaponChange = { value ->

                    onUpdateMember(member.localId) {

                        it.copy(hasWeapon = value)

                    }

                },

                onSetDriver = {

                    onSetDriver(member.localId)

                },

                onCommentChange = { value ->

                    onUpdateMember(member.localId) {

                        it.copy(comment = value)

                    }

                },

                onDelete = {

                    onRemoveMember(member.localId)

                }

            )

        }



        Button(

            onClick = onAddMember,

            modifier = Modifier.fillMaxWidth()

        ) {

            Text("Додати співробітника")

        }

    }

}



@Composable

private fun PostMemberCard(

    index: Int,

    member: PostMemberDraft,

    employees: List<EmployeeDto>,

    vehicleSelected: Boolean,

    onEmployeeChange: (SelectOption) -> Unit,

    onWeaponChange: (Boolean) -> Unit,

    onSetDriver: () -> Unit,

    onCommentChange: (String) -> Unit,

    onDelete: () -> Unit

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.large,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surfaceVariant

        ),

        border = BorderStroke(

            width = 1.dp,

            color = MaterialTheme.colorScheme.outline

        )

    ) {

        Column(

            modifier = Modifier.padding(16.dp),

            verticalArrangement = Arrangement.spacedBy(12.dp)

        ) {

            Text(

                text = "Співробітник ${index + 1}",

                style = MaterialTheme.typography.titleMedium,

                fontWeight = FontWeight.SemiBold

            )



            SelectField(

                label = "Співробітник",

                selectedLabel = findEmployeeLabel(employees, member.employeeId),

                options = employees.map {

                    SelectOption(

                        id = it.id,

                        label = it.fullName

                    )

                },

                onSelect = onEmployeeChange

            )



            WeaponSwitchRow(

                title = "Зі зброєю",

                checked = member.hasWeapon,

                onCheckedChange = onWeaponChange

            )



            DriverSwitchRow(

                checked = member.isDriver,

                enabled = vehicleSelected,

                onClick = onSetDriver

            )



            OutlinedTextField(

                value = member.comment,

                onValueChange = onCommentChange,

                modifier = Modifier.fillMaxWidth(),

                label = { Text("Коментар співробітника") },

                placeholder = { Text("Необов’язково") },

                singleLine = true

            )



            TextButton(

                onClick = onDelete,

                modifier = Modifier.fillMaxWidth()

            ) {

                Text(

                    text = "Прибрати співробітника",

                    color = MaterialTheme.colorScheme.error

                )

            }

        }

    }

}



@Composable

private fun DriverSwitchRow(

    checked: Boolean,

    enabled: Boolean,

    onClick: () -> Unit

) {

    Card(

        modifier = Modifier

            .fillMaxWidth()

            .clickable(enabled = enabled) { onClick() },

        shape = MaterialTheme.shapes.medium,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surface

        )

    ) {

        Row(

            modifier = Modifier.padding(14.dp),

            horizontalArrangement = Arrangement.SpaceBetween,

            verticalAlignment = Alignment.CenterVertically

        ) {

            Column(

                verticalArrangement = Arrangement.spacedBy(4.dp)

            ) {

                Text("Водій")



                if (!enabled) {

                    Text(

                        text = "Доступно тільки якщо вибрано автомобіль",

                        style = MaterialTheme.typography.bodySmall,

                        color = MaterialTheme.colorScheme.onSurfaceVariant

                    )

                }

            }



            Switch(

                checked = checked,

                onCheckedChange = { onClick() },

                enabled = enabled

            )

        }

    }

}



@Composable

private fun AccordionSection(

    title: String,

    subtitle: String,

    open: Boolean,

    onToggle: () -> Unit,

    content: @Composable () -> Unit

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.large,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surface

        ),

        border = BorderStroke(

            width = 1.dp,

            color = if (open) {

                MaterialTheme.colorScheme.primary

            } else {

                MaterialTheme.colorScheme.outline

            }

        )

    ) {

        Column {

            Row(

                modifier = Modifier

                    .fillMaxWidth()

                    .clickable { onToggle() }

                    .padding(18.dp),

                horizontalArrangement = Arrangement.SpaceBetween,

                verticalAlignment = Alignment.CenterVertically

            ) {

                Column(

                    modifier = Modifier.weight(1f),

                    verticalArrangement = Arrangement.spacedBy(4.dp)

                ) {

                    Text(

                        text = title,

                        style = MaterialTheme.typography.titleMedium,

                        fontWeight = FontWeight.SemiBold

                    )



                    Text(

                        text = subtitle,

                        style = MaterialTheme.typography.bodySmall,

                        color = MaterialTheme.colorScheme.onSurfaceVariant

                    )

                }



                Text(

                    text = if (open) "▲" else "▼",

                    color = MaterialTheme.colorScheme.primary

                )

            }



            if (open) {

                Column(

                    modifier = Modifier.padding(

                        start = 18.dp,

                        end = 18.dp,

                        bottom = 18.dp

                    ),

                    verticalArrangement = Arrangement.spacedBy(12.dp)

                ) {

                    content()

                }

            }

        }

    }

}



@Composable

private fun TripAccordionCard(

    index: Int,

    trip: TripDraft,

    tripGoals: List<TripGoalDto>,

    additionalAlarmReasons: List<AdditionalAlarmReasonDto>,

    validationErrors: List<String>,

    open: Boolean,

    onToggle: () -> Unit,

    onChangeGoal: (SelectOption) -> Unit,

    onChangeFrom: (String) -> Unit,

    onChangeTo: (String) -> Unit,

    onChangeDepartureTime: (String) -> Unit,

    onChangeArrivalTime: (String) -> Unit,

    onChangeDistance: (String) -> Unit,

    onChangeNote: (String) -> Unit,

    onChangeRegularAlarmType: (RegularAlarmType) -> Unit,

    onChangeAdditionalReason: (SelectOption) -> Unit,

    onChangeCustomReason: (String) -> Unit,

    onChangeOhCount: (String) -> Unit,

    onChangePartnerCount: (String) -> Unit,

    onChangeDetainedCount: (String) -> Unit,

    onChangeTransferredCount: (String) -> Unit,

    onDelete: () -> Unit

) {

    val selectedGoal = tripGoals.firstOrNull { it.id == trip.goalId }

    val goalTitle = selectedGoal?.name?.ifBlank { null } ?: "Поїздка ${index + 1}"



    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.large,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surfaceVariant

        ),

        border = BorderStroke(

            width = 1.dp,

            color = when {

                validationErrors.isNotEmpty() -> MaterialTheme.colorScheme.error

                open -> MaterialTheme.colorScheme.primary

                else -> MaterialTheme.colorScheme.outline

            }

        )

    ) {

        Column {

            Row(

                modifier = Modifier

                    .fillMaxWidth()

                    .clickable { onToggle() }

                    .padding(16.dp),

                horizontalArrangement = Arrangement.SpaceBetween,

                verticalAlignment = Alignment.CenterVertically

            ) {

                Column(

                    modifier = Modifier.weight(1f),

                    verticalArrangement = Arrangement.spacedBy(4.dp)

                ) {

                    Text(

                        text = goalTitle,

                        style = MaterialTheme.typography.titleMedium,

                        fontWeight = FontWeight.SemiBold

                    )



                    Text(

                        text = buildTripSubtitle(trip),

                        style = MaterialTheme.typography.bodySmall,

                        color = MaterialTheme.colorScheme.onSurfaceVariant

                    )

                }



                Text(

                    text = if (open) "▲" else "▼",

                    color = MaterialTheme.colorScheme.primary

                )

            }



            if (open) {

                Column(

                    modifier = Modifier.padding(

                        start = 16.dp,

                        end = 16.dp,

                        bottom = 16.dp

                    ),

                    verticalArrangement = Arrangement.spacedBy(12.dp)

                ) {

                    if (validationErrors.isNotEmpty()) {

                        Card(

                            modifier = Modifier.fillMaxWidth(),

                            shape = MaterialTheme.shapes.medium,

                            colors = CardDefaults.cardColors(

                                containerColor = MaterialTheme.colorScheme.surface

                            ),

                            border = BorderStroke(

                                width = 1.dp,

                                color = MaterialTheme.colorScheme.error

                            )

                        ) {

                            Column(

                                modifier = Modifier.padding(12.dp),

                                verticalArrangement = Arrangement.spacedBy(4.dp)

                            ) {

                                validationErrors.forEach { validationError ->

                                    Text(

                                        text = "⚠️ $validationError",

                                        color = MaterialTheme.colorScheme.error,

                                        style = MaterialTheme.typography.bodyMedium,

                                        fontWeight = FontWeight.SemiBold

                                    )

                                }

                            }

                        }

                    }



                    SelectField(

                        label = "Мета поїздки",

                        selectedLabel = findTripGoalLabel(tripGoals, trip.goalId),

                        options = tripGoals.map {

                            SelectOption(

                                id = it.id,

                                label = it.name

                            )

                        },

                        onSelect = onChangeGoal

                    )



                    OutlinedTextField(

                        value = trip.fromLocation,

                        onValueChange = onChangeFrom,

                        modifier = Modifier.fillMaxWidth(),

                        label = { Text("Звідки") },

                        singleLine = true

                    )



                    OutlinedTextField(

                        value = trip.toLocation,

                        onValueChange = onChangeTo,

                        modifier = Modifier.fillMaxWidth(),

                        label = { Text("Куди") },

                        singleLine = true

                    )



                    Row(

                        modifier = Modifier.fillMaxWidth(),

                        horizontalArrangement = Arrangement.spacedBy(10.dp)

                    ) {

                        TimeSelectField(

                            value = trip.departureTime,

                            label = "Виїзд",

                            modifier = Modifier.weight(1f),

                            preferCurrentTimeOnOpen = true,

                            onTimeSelected = { selectedTime ->

                                onChangeDepartureTime(selectedTime)



                                val departureMinutes = parseTimeToMinutes(selectedTime)

                                val arrivalMinutes = parseTimeToMinutes(trip.arrivalTime)



                                if (

                                    departureMinutes != null &&

                                    arrivalMinutes != null &&

                                    arrivalMinutes <= departureMinutes

                                ) {

                                    onChangeArrivalTime(formatMinutesToTime(departureMinutes + 1))

                                }

                            }

                        )



                        TimeSelectField(

                            value = trip.arrivalTime,

                            label = "Прибуття",

                            modifier = Modifier.weight(1f),

                            minTime = trip.departureTime,

                            preferCurrentTimeOnOpen = true,

                            onTimeSelected = onChangeArrivalTime

                        )

                    }



                    OutlinedTextField(

                        value = trip.distanceKm,

                        onValueChange = onChangeDistance,

                        modifier = Modifier.fillMaxWidth(),

                        label = { Text("Відстань, км") },

                        placeholder = { Text("Наприклад: 12.5") },

                        singleLine = true,

                        keyboardOptions = KeyboardOptions(

                            keyboardType = KeyboardType.Decimal

                        )

                    )



                    if (isRegularAlarmGoal(selectedGoal)) {

                        RegularAlarmFields(

                            trip = trip,

                            alarmSourceLabel = getRegularAlarmSourceLabel(selectedGoal),

                            onChangeRegularAlarmType = onChangeRegularAlarmType,

                            onChangeDetainedCount = onChangeDetainedCount,

                            onChangeTransferredCount = onChangeTransferredCount

                        )

                    }



                    if (isAdditionalAlarmGoal(selectedGoal)) {

                        AdditionalAlarmFields(

                            trip = trip,

                            reasons = additionalAlarmReasons,

                            onChangeAdditionalReason = onChangeAdditionalReason,

                            onChangeCustomReason = onChangeCustomReason,

                            onChangeOhCount = onChangeOhCount,

                            onChangePartnerCount = onChangePartnerCount,

                            onChangeDetainedCount = onChangeDetainedCount,

                            onChangeTransferredCount = onChangeTransferredCount

                        )

                    }



                    OutlinedTextField(

                        value = trip.note,

                        onValueChange = onChangeNote,

                        modifier = Modifier.fillMaxWidth(),

                        label = { Text("Примітка") },

                        minLines = 2

                    )



                    TextButton(

                        onClick = onDelete,

                        modifier = Modifier.fillMaxWidth()

                    ) {

                        Text(

                            text = "Видалити поїздку",

                            color = MaterialTheme.colorScheme.error

                        )

                    }

                }

            }

        }

    }

}



@Composable

private fun RegularAlarmFields(

    trip: TripDraft,

    alarmSourceLabel: String,

    onChangeRegularAlarmType: (RegularAlarmType) -> Unit,

    onChangeDetainedCount: (String) -> Unit,

    onChangeTransferredCount: (String) -> Unit

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.medium,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surface

        ),

        border = BorderStroke(

            width = 1.dp,

            color = MaterialTheme.colorScheme.outline

        )

    ) {

        Column(

            modifier = Modifier.padding(14.dp),

            verticalArrangement = Arrangement.spacedBy(12.dp)

        ) {

            Text(

                text = "Спрацювання: $alarmSourceLabel",

                style = MaterialTheme.typography.titleSmall,

                fontWeight = FontWeight.SemiBold

            )



            SelectField(

                label = "Тип спрацювання",

                selectedLabel = trip.regularAlarmType.label,

                options = RegularAlarmType.entries.mapIndexed { index, type ->

                    SelectOption(

                        id = index,

                        label = type.label

                    )

                },

                onSelect = { option ->

                    onChangeRegularAlarmType(RegularAlarmType.entries[option.id])

                }

            )



            OutlinedTextField(

                value = trip.detainedCount,

                onValueChange = onChangeDetainedCount,

                modifier = Modifier.fillMaxWidth(),

                label = { Text("Затримано") },

                placeholder = { Text("0") },

                singleLine = true,

                keyboardOptions = KeyboardOptions(

                    keyboardType = KeyboardType.Number

                )

            )



            OutlinedTextField(

                value = trip.transferredCount,

                onValueChange = onChangeTransferredCount,

                modifier = Modifier.fillMaxWidth(),

                label = { Text("Передано в поліцію") },

                placeholder = { Text("0") },

                singleLine = true,

                keyboardOptions = KeyboardOptions(

                    keyboardType = KeyboardType.Number

                )

            )

        }

    }

}



@Composable

private fun AdditionalAlarmFields(

    trip: TripDraft,

    reasons: List<AdditionalAlarmReasonDto>,

    onChangeAdditionalReason: (SelectOption) -> Unit,

    onChangeCustomReason: (String) -> Unit,

    onChangeOhCount: (String) -> Unit,

    onChangePartnerCount: (String) -> Unit,

    onChangeDetainedCount: (String) -> Unit,

    onChangeTransferredCount: (String) -> Unit

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.medium,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surface

        ),

        border = BorderStroke(

            width = 1.dp,

            color = MaterialTheme.colorScheme.outline

        )

    ) {

        Column(

            modifier = Modifier.padding(14.dp),

            verticalArrangement = Arrangement.spacedBy(12.dp)

        ) {

            Text(

                text = "Список спрацювань",

                style = MaterialTheme.typography.titleSmall,

                fontWeight = FontWeight.SemiBold

            )



            SelectField(

                label = "Причина",

                selectedLabel = findAdditionalReasonLabel(reasons, trip.additionalReasonId),

                options = listOf(

                    SelectOption(

                        id = 0,

                        label = "Своя причина"

                    )

                ) + reasons.map {

                    SelectOption(

                        id = it.id,

                        label = it.name

                    )

                },

                onSelect = onChangeAdditionalReason

            )



            if (trip.additionalReasonId == 0) {

                OutlinedTextField(

                    value = trip.customReasonText,

                    onValueChange = onChangeCustomReason,

                    modifier = Modifier.fillMaxWidth(),

                    label = { Text("Своя причина") },

                    singleLine = true

                )

            }



            Row(

                modifier = Modifier.fillMaxWidth(),

                horizontalArrangement = Arrangement.spacedBy(10.dp)

            ) {

                OutlinedTextField(

                    value = trip.ohCount,

                    onValueChange = onChangeOhCount,

                    modifier = Modifier.weight(1f),

                    label = { Text("ОХ") },

                    placeholder = { Text("0") },

                    singleLine = true,

                    keyboardOptions = KeyboardOptions(

                        keyboardType = KeyboardType.Number

                    )

                )



                OutlinedTextField(

                    value = trip.partnerCount,

                    onValueChange = onChangePartnerCount,

                    modifier = Modifier.weight(1f),

                    label = { Text("Партнери") },

                    placeholder = { Text("0") },

                    singleLine = true,

                    keyboardOptions = KeyboardOptions(

                        keyboardType = KeyboardType.Number

                    )

                )

            }



            OutlinedTextField(

                value = trip.detainedCount,

                onValueChange = onChangeDetainedCount,

                modifier = Modifier.fillMaxWidth(),

                label = { Text("Затримано") },

                placeholder = { Text("0") },

                singleLine = true,

                keyboardOptions = KeyboardOptions(

                    keyboardType = KeyboardType.Number

                )

            )



            OutlinedTextField(

                value = trip.transferredCount,

                onValueChange = onChangeTransferredCount,

                modifier = Modifier.fillMaxWidth(),

                label = { Text("Передано в поліцію") },

                placeholder = { Text("0") },

                singleLine = true,

                keyboardOptions = KeyboardOptions(

                    keyboardType = KeyboardType.Number

                )

            )

        }

    }

}



@Composable

private fun SelectField(

    label: String,

    selectedLabel: String,

    options: List<SelectOption>,

    error: String? = null,

    onSelect: (SelectOption) -> Unit

) {

    var dialogOpen by remember { mutableStateOf(false) }



    Column(

        verticalArrangement = Arrangement.spacedBy(4.dp)

    ) {

        Card(

            modifier = Modifier

                .fillMaxWidth()

                .clickable { dialogOpen = true },

            shape = MaterialTheme.shapes.medium,

            colors = CardDefaults.cardColors(

                containerColor = MaterialTheme.colorScheme.surfaceVariant

            ),

            border = BorderStroke(

                width = 1.dp,

                color = if (error != null) {

                    MaterialTheme.colorScheme.error

                } else {

                    MaterialTheme.colorScheme.outline

                }

            )

        ) {

            Row(

                modifier = Modifier

                    .fillMaxWidth()

                    .padding(14.dp),

                horizontalArrangement = Arrangement.SpaceBetween,

                verticalAlignment = Alignment.CenterVertically

            ) {

                Column(

                    modifier = Modifier.weight(1f),

                    verticalArrangement = Arrangement.spacedBy(5.dp)

                ) {

                    Text(

                        text = label,

                        style = MaterialTheme.typography.labelLarge,

                        color = if (error != null) {

                            MaterialTheme.colorScheme.error

                        } else {

                            MaterialTheme.colorScheme.onSurfaceVariant

                        }

                    )



                    Text(

                        text = selectedLabel.ifBlank { "Не вибрано" },

                        style = MaterialTheme.typography.bodyLarge,

                        fontWeight = FontWeight.SemiBold

                    )

                }



                Text(

                    text = "⌄",

                    color = if (error != null) {

                        MaterialTheme.colorScheme.error

                    } else {

                        MaterialTheme.colorScheme.primary

                    },

                    style = MaterialTheme.typography.titleMedium

                )

            }

        }



        if (error != null) {

            Text(

                text = error,

                color = MaterialTheme.colorScheme.error,

                style = MaterialTheme.typography.bodySmall,

                modifier = Modifier.padding(start = 4.dp)

            )

        }

    }



    if (dialogOpen) {

        AlertDialog(

            onDismissRequest = { dialogOpen = false },

            title = {

                Text(label)

            },

            text = {

                Column(

                    modifier = Modifier

                        .fillMaxWidth()

                        .heightIn(max = 420.dp)

                        .verticalScroll(rememberScrollState()),

                    verticalArrangement = Arrangement.spacedBy(8.dp)

                ) {

                    if (options.isEmpty()) {

                        Text("Немає доступних варіантів")

                    } else {

                        options.forEach { option ->

                            Card(

                                modifier = Modifier

                                    .fillMaxWidth()

                                    .clickable {

                                        onSelect(option)

                                        dialogOpen = false

                                    },

                                shape = MaterialTheme.shapes.medium,

                                colors = CardDefaults.cardColors(

                                    containerColor = MaterialTheme.colorScheme.surfaceVariant

                                )

                            ) {

                                Text(

                                    text = option.label,

                                    modifier = Modifier.padding(14.dp),

                                    style = MaterialTheme.typography.bodyLarge

                                )

                            }

                        }

                    }

                }

            },

            confirmButton = {

                TextButton(onClick = { dialogOpen = false }) {

                    Text("Закрити")

                }

            }

        )

    }

}





@Composable

private fun WeaponSwitchRow(

    title: String,

    checked: Boolean,

    onCheckedChange: (Boolean) -> Unit

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.medium,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surfaceVariant

        )

    ) {

        Row(

            modifier = Modifier.padding(14.dp),

            horizontalArrangement = Arrangement.SpaceBetween,

            verticalAlignment = Alignment.CenterVertically

        ) {

            Text(title)



            Switch(

                checked = checked,

                onCheckedChange = onCheckedChange

            )

        }

    }

}



private data class GbrAlarmReasonSummary(

    val label: String,

    val total: Int

)



private data class GbrAlarmSummary(

    val totalAlarms: Int,

    val falseTotal: Int,

    val combatTotal: Int,

    val additionalTotal: Int,

    val additionalReasons: List<GbrAlarmReasonSummary>,

    val detained: Int,

    val transferred: Int

)



private fun buildGbrAlarmSummary(

    trips: List<TripDraft>,

    tripGoals: List<TripGoalDto>,

    additionalAlarmReasons: List<AdditionalAlarmReasonDto>

): GbrAlarmSummary {

    var falseTotal = 0

    var combatTotal = 0

    var additionalTotal = 0

    var detained = 0

    var transferred = 0



    val additionalReasonMap = linkedMapOf<String, Int>()



    trips.forEach { trip ->

        val goal = tripGoals.firstOrNull { it.id == trip.goalId }



        if (isRegularAlarmGoal(goal)) {

            if (trip.regularAlarmType.isCombat) {

                combatTotal += 1

            } else {

                falseTotal += 1

            }

        }



        if (isAdditionalAlarmGoal(goal)) {

            val oh = trip.ohCount.toIntOrNull() ?: 0

            val partner = trip.partnerCount.toIntOrNull() ?: 0

            val total = oh + partner



            if (total > 0) {

                val reasonLabel = if (trip.additionalReasonId > 0) {

                    findAdditionalReasonLabel(additionalAlarmReasons, trip.additionalReasonId)

                } else {

                    trip.customReasonText.trim().ifBlank { "Без причини" }

                }



                additionalTotal += total

                additionalReasonMap[reasonLabel] = (additionalReasonMap[reasonLabel] ?: 0) + total

            }

        }



        detained += trip.detainedCount.toIntOrNull() ?: 0

        transferred += trip.transferredCount.toIntOrNull() ?: 0

    }



    return GbrAlarmSummary(

        totalAlarms = falseTotal + combatTotal + additionalTotal,

        falseTotal = falseTotal,

        combatTotal = combatTotal,

        additionalTotal = additionalTotal,

        additionalReasons = additionalReasonMap

            .map { (label, total) ->

                GbrAlarmReasonSummary(

                    label = label,

                    total = total

                )

            }

            .sortedBy { it.label.lowercase() },

        detained = detained,

        transferred = transferred

    )

}



@Composable

private fun GbrAlarmSummaryCascade(

    summary: GbrAlarmSummary

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.medium,

        colors = CardDefaults.cardColors(

            containerColor = MaterialTheme.colorScheme.surfaceVariant

        ),

        border = BorderStroke(

            width = 1.dp,

            color = MaterialTheme.colorScheme.outline

        )

    ) {

        Column(

            modifier = Modifier.padding(14.dp),

            verticalArrangement = Arrangement.spacedBy(6.dp)

        ) {

            Text(

                text = "Спрацювання та результат",

                style = MaterialTheme.typography.titleSmall,

                fontWeight = FontWeight.SemiBold

            )



            CascadeText(

                text = "Спрацювань: ${summary.totalAlarms}",

                level = 0,

                bold = true

            )



            CascadeText(

                text = "− хибних: ${summary.falseTotal}",

                level = 1

            )



            CascadeText(

                text = "− бойових: ${summary.combatTotal}",

                level = 1

            )



            CascadeText(

                text = "− додатково: ${summary.additionalTotal}",

                level = 1

            )



            if (summary.additionalReasons.isEmpty()) {

                CascadeText(

                    text = "Немає додаткових причин",

                    level = 2,

                    muted = true

                )

            } else {

                summary.additionalReasons.forEach { reason ->

                    CascadeText(

                        text = "${reason.label}: ${reason.total}",

                        level = 2

                    )

                }

            }



            CascadeText(

                text = "Затримано: ${summary.detained}",

                level = 0,

                bold = true

            )



            CascadeText(

                text = "− передано до поліції: ${summary.transferred}",

                level = 1

            )

        }

    }

}



@Composable

private fun CascadeText(

    text: String,

    level: Int,

    bold: Boolean = false,

    muted: Boolean = false

) {

    Text(

        text = text,

        modifier = Modifier.padding(start = (level * 18).dp),

        style = MaterialTheme.typography.bodyMedium,

        fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,

        color = if (muted) {

            MaterialTheme.colorScheme.onSurfaceVariant

        } else {

            MaterialTheme.colorScheme.onSurface

        }

    )

}





@Composable

private fun GbrSummaryCard(

    crew: String,

    vehicle: String,

    driver: String,

    senior: String,

    shiftDate: String,

    shiftTime: String,

    odometerStart: String,

    tripDistanceKm: Double,

    driverHasWeapon: Boolean,

    seniorHasWeapon: Boolean,

    tripsCount: Int,

    trips: List<TripDraft>,

    tripGoals: List<TripGoalDto>,

    additionalAlarmReasons: List<AdditionalAlarmReasonDto>,

    gbrSaveSuccess: String,

    gbrSaveError: String,

    saving: Boolean,

    onSave: () -> Unit

) {

    val isValid = crew.isNotBlank() &&

        vehicle.isNotBlank() &&

        driver.isNotBlank() &&

        senior.isNotBlank() &&

        shiftDate.isNotBlank() &&

        shiftTime.isNotBlank() &&

        odometerStart.isNotBlank() &&

        tripsCount > 0



    val alarmSummary = buildGbrAlarmSummary(

        trips = trips,

        tripGoals = tripGoals,

        additionalAlarmReasons = additionalAlarmReasons

    )



    Column(

        verticalArrangement = Arrangement.spacedBy(10.dp)

    ) {

        Text("Тип: Наряд ГШР")

        Text("Наряд: ${crew.ifBlank { "Не вибрано" }}")

        Text("Авто: ${vehicle.ifBlank { "Не вибрано" }}")

        Text("Водій: ${driver.ifBlank { "Не вибрано" }}")

        Text("Старший: ${senior.ifBlank { "Не вибрано" }}")

        val odometerStartNumber = odometerStart.toDoubleOrNull()

        val odometerEndLabel = if (odometerStartNumber == null) {

            "Не вказано"

        } else {

            "${formatDistanceValue(odometerStartNumber + tripDistanceKm)} км"

        }



        Text("Дата і час: $shiftDate $shiftTime")

        Text("Спідометр початок: ${odometerStart.ifBlank { "Не вказано" }}")

        Text("Спідометр кінець: $odometerEndLabel")

        Text("Добовий пробіг: ${formatDistanceValue(tripDistanceKm)} км")

        Text("Поїздок: $tripsCount")

        GbrAlarmSummaryCascade(alarmSummary)

        Text("Зброя: водій ${if (driverHasWeapon) "так" else "ні"}, старший ${if (seniorHasWeapon) "так" else "ні"}")



        if (gbrSaveSuccess.isNotBlank()) {

            Text(

                text = gbrSaveSuccess,

                color = MaterialTheme.colorScheme.primary

            )

        }



        if (gbrSaveError.isNotBlank()) {

            Text(

                text = gbrSaveError,

                color = MaterialTheme.colorScheme.error

            )

        }



        Button(

            onClick = onSave,

            modifier = Modifier.fillMaxWidth(),

            enabled = !saving

        ) {

            Text(if (saving) "Збереження..." else "Відправити звіт")

        }



        if (!isValid) {

            Text(

                text = "Натисніть “Зберегти наряд ГШР” — додаток покаже всі поля, які потрібно заповнити.",

                color = MaterialTheme.colorScheme.onSurfaceVariant

            )

        }

    }

}



@Composable

private fun PostSummaryCard(

    post: String,

    vehicle: String,

    dutyType: String,

    postDate: String,

    postTime: String,

    durationHours: String,

    members: List<PostMemberDraft>,

    employees: List<EmployeeDto>,

    postSaveSuccess: String,

    postSaveError: String,

    saving: Boolean,

    onSave: () -> Unit

) {

    val validMembers = members.filter { it.employeeId > 0 }

    val duration = durationHours.replace(",", ".").toDoubleOrNull()

    val isValid = post.isNotBlank() &&

        postDate.isNotBlank() &&

        postTime.isNotBlank() &&

        duration != null &&

        duration > 0.0 &&

        duration <= 24.0 &&

        validMembers.isNotEmpty()



    Column(

        verticalArrangement = Arrangement.spacedBy(10.dp)

    ) {

        Text("Тип: Пост")

        Text("Пост: ${post.ifBlank { "Не вибрано" }}")

        Text("Тип поста: $dutyType")

        Text("Авто: $vehicle")

        Text("Дата і час: $postDate $postTime")

        Text("Тривалість: ${durationHours.ifBlank { "Не вказано" }} год.")

        Text("Еквівалент зміни: ${calculateShiftEquivalentLabel(durationHours)}")



        Text("Співробітники:")

        if (validMembers.isEmpty()) {

            Text("— не додані")

        } else {

            validMembers.forEach { member ->

                val employeeName = findEmployeeLabel(employees, member.employeeId)

                Text(

                    text = "• $employeeName" +

                        if (member.hasWeapon) " · зброя" else "" +

                        if (member.isDriver) " · водій" else ""

                )

            }

        }



        if (postSaveSuccess.isNotBlank()) {

            Text(

                text = postSaveSuccess,

                color = MaterialTheme.colorScheme.primary

            )

        }



        if (postSaveError.isNotBlank()) {

            Text(

                text = postSaveError,

                color = MaterialTheme.colorScheme.error

            )

        }



        Button(

            onClick = onSave,

            modifier = Modifier.fillMaxWidth(),

            enabled = isValid && !saving

        ) {

            Text(if (saving) "Збереження..." else "Відправити звіт")

        }



        if (!isValid) {

            Text(

                text = "Заповніть пост, дату, години та додайте хоча б одного співробітника.",

                color = MaterialTheme.colorScheme.error

            )

        }

    }

}



@Composable

private fun SendReportConfirmDialog(

    kind: ShiftKind,

    onConfirm: () -> Unit,

    onDismiss: () -> Unit

) {

    val reportName = when (kind) {

        ShiftKind.GBR -> "звіт наряду ГШР"

        ShiftKind.POST -> "звіт постового чергування"

    }



    val description = when (kind) {

        ShiftKind.GBR -> "Перевірте дані наряду, поїздки, пробіг і спрацювання. Після відправлення звіт буде передано на сервер. Якщо для наряду увімкнено Telegram, звіт також буде надіслано у вибрані канали."

        ShiftKind.POST -> "Перевірте дані поста, дату, тривалість, автомобіль і співробітників. Після відправлення звіт буде передано на сервер. Якщо для поста увімкнено Telegram, звіт також буде надіслано у вибрані канали."

    }



    AlertDialog(

        onDismissRequest = onDismiss,

        title = {

            Text("Відправити звіт?")

        },

        text = {

            Column(

                verticalArrangement = Arrangement.spacedBy(8.dp)

            ) {

                Text("Ви збираєтесь відправити $reportName.")

                Text(description)

                Text(

                    text = "Якщо зараз немає інтернету, звіт буде збережено в чергу та відправлено пізніше.",

                    color = MaterialTheme.colorScheme.onSurfaceVariant,

                    style = MaterialTheme.typography.bodySmall

                )

            }

        },

        confirmButton = {

            Button(onClick = onConfirm) {

                Text("Відправити")

            }

        },

        dismissButton = {

            TextButton(onClick = onDismiss) {

                Text("Скасувати")

            }

        }

    )

}





@Composable

private fun ResetShiftDialog(

    onConfirm: () -> Unit,

    onDismiss: () -> Unit

) {

    AlertDialog(

        onDismissRequest = onDismiss,

        title = {

            Text("Видалити дані?")

        },

        text = {

            Text("Усі заповнені дані, поїздки і чернетка будуть очищені. Після цього можна почати нову зміну.")

        },

        confirmButton = {

            Button(onClick = onConfirm) {

                Text("Видалити")

            }

        },

        dismissButton = {

            TextButton(onClick = onDismiss) {

                Text("Скасувати")

            }

        }

    )

}







@Composable

private fun TimeSelectField(

    value: String,

    label: String,

    modifier: Modifier = Modifier,

    minTime: String? = null,

    preferCurrentTimeOnOpen: Boolean = false,

    supportingText: String? = null,

    onTimeSelected: (String) -> Unit

) {

    val context = LocalContext.current



    fun openPicker() {

        val minMinutes = parseTimeToMinutes(minTime)

        val nowMinutes = parseTimeToMinutes(getCurrentTimeInput())

        val preferredMinutes = if (preferCurrentTimeOnOpen) {

            nowMinutes

                ?: parseTimeToMinutes(value)

                ?: minMinutes?.let { (it + 1).coerceAtMost(23 * 60 + 59) }

                ?: 0

        } else {

            parseTimeToMinutes(value)

                ?: minMinutes?.let { (it + 1).coerceAtMost(23 * 60 + 59) }

                ?: nowMinutes

                ?: 0

        }

        val currentMinutes = if (

            minMinutes != null &&

            preferredMinutes <= minMinutes

        ) {

            (minMinutes + 1).coerceAtMost(23 * 60 + 59)

        } else {

            preferredMinutes

        }



        TimePickerDialog(

            context,

            { _, hourOfDay, minute ->

                val selectedMinutes = hourOfDay * 60 + minute



                val finalMinutes = if (

                    minMinutes != null &&

                    selectedMinutes <= minMinutes

                ) {

                    (minMinutes + 1).coerceAtMost(23 * 60 + 59)

                } else {

                    selectedMinutes

                }



                onTimeSelected(formatMinutesToTime(finalMinutes))

            },

            currentMinutes / 60,

            currentMinutes % 60,

            true

        ).show()

    }



    Column(

        modifier = modifier,

        verticalArrangement = Arrangement.spacedBy(4.dp)

    ) {

        Text(

            text = label,

            style = MaterialTheme.typography.labelLarge,

            color = MaterialTheme.colorScheme.onSurfaceVariant

        )



        OutlinedButton(

            onClick = { openPicker() },

            modifier = Modifier.fillMaxWidth()

        ) {

            Text(

                text = "🕒 ${value.ifBlank { "Обрати час" }}",

                fontWeight = FontWeight.SemiBold

            )

        }



        if (!supportingText.isNullOrBlank()) {

            Text(

                text = supportingText,

                style = MaterialTheme.typography.bodySmall,

                color = MaterialTheme.colorScheme.onSurfaceVariant

            )

        }

    }

}



private fun parseTimeToMinutes(value: String?): Int? {

    val trimmedValue = value?.trim().orEmpty()



    if (trimmedValue.isBlank()) {

        return null

    }



    val parts = trimmedValue.split(":")



    if (parts.size != 2) {

        return null

    }



    val hour = parts[0].toIntOrNull()

    val minute = parts[1].toIntOrNull()



    if (hour == null || minute == null) {

        return null

    }



    if (hour !in 0..23 || minute !in 0..59) {

        return null

    }



    return hour * 60 + minute

}



private fun formatTimeInput(

    hour: Int,

    minute: Int

): String {

    return String.format(Locale.US, "%02d:%02d", hour, minute)

}



private fun formatMinutesToTime(minutes: Int): String {

    val normalizedMinutes = minutes.coerceIn(0, 23 * 60 + 59)



    return formatTimeInput(

        hour = normalizedMinutes / 60,

        minute = normalizedMinutes % 60

    )

}



private fun normalizeTimeInput(value: String): String {

    return parseTimeToMinutes(value)

        ?.let { formatMinutesToTime(it) }

        ?: value.trim()

}



private fun buildIsoDateTime(

    date: String,

    time: String

): String {

    return "${date.trim()}T${normalizeTimeInput(time)}:00.000Z"

}





@Composable

private fun SavingDialog(

    text: String

) {

    AlertDialog(

        onDismissRequest = {

            // Во время сохранения закрывать нельзя.

        },

        title = {

            Text("Зачекайте")

        },

        text = {

            Row(

                horizontalArrangement = Arrangement.spacedBy(12.dp),

                verticalAlignment = Alignment.CenterVertically

            ) {

                CircularProgressIndicator()

                Text(text)

            }

        },

        confirmButton = {}

    )

}



@Composable

private fun SaveResultDialog(

    title: String,

    message: String,

    onOk: () -> Unit

) {

    AlertDialog(

        onDismissRequest = {

            // Закрываем только через OK, чтобы точно сбросить форму.

        },

        title = {

            Text(title)

        },

        text = {

            Text(message)

        },

        confirmButton = {

            Button(onClick = onOk) {

                Text("OK")

            }

        }

    )

}



@Composable

private fun LoadingCard() {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.large

    ) {

        Row(

            modifier = Modifier.padding(18.dp),

            horizontalArrangement = Arrangement.spacedBy(12.dp),

            verticalAlignment = Alignment.CenterVertically

        ) {

            CircularProgressIndicator()

            Text("Завантаження даних...")

        }

    }

}



@Composable

private fun ErrorCard(

    message: String,

    onRetry: () -> Unit

) {

    Card(

        modifier = Modifier.fillMaxWidth(),

        shape = MaterialTheme.shapes.large

    ) {

        Column(

            modifier = Modifier.padding(18.dp),

            verticalArrangement = Arrangement.spacedBy(12.dp)

        ) {

            Text(

                text = message,

                color = MaterialTheme.colorScheme.error

            )



            Button(onClick = onRetry) {

                Text("Спробувати ще раз")

            }

        }

    }

}



private fun buildTripSubtitle(trip: TripDraft): String {

    val from = trip.fromLocation.ifBlank { "звідки не вказано" }

    val to = trip.toLocation.ifBlank { "куди не вказано" }



    return "$from → $to"

}


private fun buildGbrTripsSectionSubtitle(
    trips: List<TripDraft>,
    odometerStart: String
): String {
    if (trips.isEmpty()) {
        return "Поїздки ще не додані"
    }

    val tripDistanceKm = calculateTripsDistanceKm(trips)
    val odometerStartNumber = odometerStart.toDoubleOrNull()
    val odometerEndLabel = if (odometerStartNumber == null) {
        "Не вказано"
    } else {
        "${formatDistanceValue(odometerStartNumber + tripDistanceKm)} км"
    }

    val currentMileageLabel = "${formatDistanceValue(tripDistanceKm)} км"

    return "· Додано поїздок: ${trips.size}\n· Спідометр кінець: $odometerEndLabel\n· Поточний пробіг: $currentMileageLabel"
}



private fun calculateTripsDistanceKm(trips: List<TripDraft>): Double {

    return trips.sumOf { trip ->

        trip.distanceKm

            .replace(",", ".")

            .toDoubleOrNull()

            ?: 0.0

    }

}



private fun formatDistanceValue(value: Double): String {

    val formatted = String.format(Locale.US, "%.2f", value)

    return formatted.trimEnd('0').trimEnd('.')

}





private fun getTripValidationErrors(

    trip: TripDraft,

    tripGoals: List<TripGoalDto>

): List<String> {

    val errors = mutableListOf<String>()

    val goal = tripGoals.firstOrNull { it.id == trip.goalId }



    if (trip.goalId <= 0) {

        errors.add("оберіть мета поїздки")

    }



    if (trip.fromLocation.isBlank()) {

        errors.add("вкажіть звідки")

    }



    if (trip.toLocation.isBlank()) {

        errors.add("вкажіть куди")

    }



    if (trip.departureTime.isBlank()) {

        errors.add("вкажіть час виїзду")

    }



    if (trip.arrivalTime.isBlank()) {

        errors.add("вкажіть час прибуття")

    }



    val departureMinutes = parseTimeToMinutes(trip.departureTime)

    val arrivalMinutes = parseTimeToMinutes(trip.arrivalTime)



    if (trip.departureTime.isNotBlank() && departureMinutes == null) {

        errors.add("некоректний час виїзду")

    }



    if (trip.arrivalTime.isNotBlank() && arrivalMinutes == null) {

        errors.add("некоректний час прибуття")

    }



    if (

        departureMinutes != null &&

        arrivalMinutes != null &&

        arrivalMinutes <= departureMinutes

    ) {

        errors.add("час прибуття має бути пізніше часу виїзду")

    }



    if (trip.distanceKm.replace(",", ".").toDoubleOrNull() == null) {

        errors.add("вкажіть відстань")

    }



    if (isRegularAlarmGoal(goal)) {

        if (trip.detainedCount.isNotBlank() && trip.detainedCount.toIntOrNull() == null) {

            errors.add("затримано має бути числом")

        }



        if (trip.transferredCount.isNotBlank() && trip.transferredCount.toIntOrNull() == null) {

            errors.add("передано має бути числом")

        }

    }



    if (isAdditionalAlarmGoal(goal)) {

        val ohCount = trip.ohCount.toIntOrNull() ?: 0

        val partnerCount = trip.partnerCount.toIntOrNull() ?: 0

        val hasReason = trip.additionalReasonId > 0 || trip.customReasonText.isNotBlank()



        if (!hasReason) {

            errors.add("оберіть причину або введіть свою причину")

        }



        if (ohCount + partnerCount <= 0) {

            errors.add("вкажіть кількість ОХ або партнерів")

        }



        if (trip.detainedCount.isNotBlank() && trip.detainedCount.toIntOrNull() == null) {

            errors.add("затримано має бути числом")

        }



        if (trip.transferredCount.isNotBlank() && trip.transferredCount.toIntOrNull() == null) {

            errors.add("передано має бути числом")

        }

    }



    return errors

}



private fun validateTripEvents(

    trips: List<TripDraft>,

    tripGoals: List<TripGoalDto>

): String {

    trips.forEachIndexed { index, trip ->

        val goal = tripGoals.firstOrNull { it.id == trip.goalId }



        if (isAdditionalAlarmGoal(goal)) {

            val ohCount = trip.ohCount.toIntOrNull() ?: 0

            val partnerCount = trip.partnerCount.toIntOrNull() ?: 0

            val hasReason = trip.additionalReasonId > 0 || trip.customReasonText.isNotBlank()



            if (!hasReason) {

                return "Поїздка ${index + 1}: оберіть причину або введіть свою причину"

            }



            if (ohCount + partnerCount <= 0) {

                return "Поїздка ${index + 1}: вкажіть кількість ОХ або партнерів"

            }

        }

    }



    return ""

}



private fun buildTripEvents(

    trip: TripDraft,

    tripGoals: List<TripGoalDto>

): List<CreateMobileShiftTripEventRequest> {

    val goal = tripGoals.firstOrNull { it.id == trip.goalId }



    if (isOhAlarmGoal(goal)) {

        return listOf(

            CreateMobileShiftTripEventRequest(

                eventCategory = "REGULAR_ALARM",

                alarmSource = "OH",

                countTotal = 1,

                isCombat = trip.regularAlarmType.isCombat,

                reasonId = null,

                customReasonText = null,

                ohCount = null,

                partnerCount = null,

                detainedCount = trip.detainedCount.toIntOrNull() ?: 0,

                transferredCount = trip.transferredCount.toIntOrNull() ?: 0,

                note = null

            )

        )

    }



    if (isPartnerAlarmGoal(goal)) {

        return listOf(

            CreateMobileShiftTripEventRequest(

                eventCategory = "REGULAR_ALARM",

                alarmSource = "PARTNER",

                countTotal = 1,

                isCombat = trip.regularAlarmType.isCombat,

                reasonId = null,

                customReasonText = null,

                ohCount = null,

                partnerCount = null,

                detainedCount = trip.detainedCount.toIntOrNull() ?: 0,

                transferredCount = trip.transferredCount.toIntOrNull() ?: 0,

                note = null

            )

        )

    }



    if (isAdditionalAlarmGoal(goal)) {

        return listOf(

            CreateMobileShiftTripEventRequest(

                eventCategory = "ADDITIONAL_ALARM",

                alarmSource = null,

                countTotal = null,

                isCombat = null,

                reasonId = trip.additionalReasonId.takeIf { it > 0 },

                customReasonText = trip.customReasonText.trim().ifBlank { null },

                ohCount = trip.ohCount.toIntOrNull() ?: 0,

                partnerCount = trip.partnerCount.toIntOrNull() ?: 0,

                detainedCount = trip.detainedCount.toIntOrNull() ?: 0,

                transferredCount = trip.transferredCount.toIntOrNull() ?: 0,

                note = null

            )

        )

    }



    return emptyList()

}





private fun isRegularAlarmGoal(goal: TripGoalDto?): Boolean {

    return isOhAlarmGoal(goal) || isPartnerAlarmGoal(goal)

}



private fun isOhAlarmGoal(goal: TripGoalDto?): Boolean {

    if (goal?.systemCode == TRIP_GOAL_ALARM_OH) {

        return true

    }



    val text = goalSearchText(goal)



    return text.contains("ох") ||

        text.contains("oh") ||

        text.contains("охрана") ||

        text.contains("охорона")

}



private fun isPartnerAlarmGoal(goal: TripGoalDto?): Boolean {

    if (goal?.systemCode == TRIP_GOAL_ALARM_PARTNER) {

        return true

    }



    val text = goalSearchText(goal)



    return text.contains("партнер") ||

        text.contains("партнеры") ||

        text.contains("партнери") ||

        text.contains("partner")

}



private fun isAdditionalAlarmGoal(goal: TripGoalDto?): Boolean {

    if (goal?.systemCode == TRIP_GOAL_ADDITIONAL_ALARM_LIST) {

        return true

    }



    val text = goalSearchText(goal)



    return (text.contains("список") && text.contains("спрац")) ||

        text.contains("додатков") ||

        text.contains("дополн") ||

        text.contains("additional")

}



private fun getRegularAlarmSourceLabel(goal: TripGoalDto?): String {

    return when {

        isOhAlarmGoal(goal) -> "ОХ"

        isPartnerAlarmGoal(goal) -> "Партнери"

        else -> "Спрацювання"

    }

}



private fun goalSearchText(goal: TripGoalDto?): String {

    return "${goal?.name.orEmpty()} ${goal?.systemCode.orEmpty()}".lowercase()

}



private fun calculateShiftEquivalentLabel(durationHours: String): String {

    val duration = durationHours.replace(",", ".").toDoubleOrNull() ?: return "—"

    val value = duration / 24.0



    return String.format(Locale.getDefault(), "%.2f", value)

}



private fun findCrewLabel(items: List<CrewDto>, id: Int): String {

    return items.firstOrNull { it.id == id }?.name.orEmpty()

}



private fun findDutyPostLabel(items: List<DutyPostDto>, id: Int): String {

    return items.firstOrNull { it.id == id }?.name.orEmpty()

}



private fun findVehicleLabel(items: List<VehicleDto>, id: Int): String {

    val vehicle = items.firstOrNull { it.id == id } ?: return ""



    return "${vehicle.title} · ${vehicle.licensePlate.orEmpty()}"

}



private fun findEmployeeLabel(items: List<EmployeeDto>, id: Int): String {

    return items.firstOrNull { it.id == id }?.fullName.orEmpty()

}



private fun findTripGoalLabel(items: List<TripGoalDto>, id: Int): String {

    return items.firstOrNull { it.id == id }?.name.orEmpty()

}



private fun findAdditionalReasonLabel(items: List<AdditionalAlarmReasonDto>, id: Int): String {

    if (id == 0) {

        return "Своя причина"

    }



    return items.firstOrNull { it.id == id }?.name.orEmpty()

}



private fun getCurrentDateInput(): String {

    return SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

}



private fun getCurrentTimeInput(): String {

    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

}



private fun createLocalShiftId(): String {

    return "android-${System.currentTimeMillis()}"

}



private fun createPendingId(prefix: String): String {

    return "$prefix-${System.currentTimeMillis()}"

}



private fun getApiErrorMessage(exception: Exception): String {

    if (exception is HttpException) {

        val errorBody = exception.response()?.errorBody()?.string()



        if (!errorBody.isNullOrBlank()) {

            return errorBody

        }



        return "HTTP ${exception.code()}"

    }



    return exception.message ?: "Невідома помилка"

}



private fun String.filterDigitsOnly(): String {

    return filter { it.isDigit() }

}
