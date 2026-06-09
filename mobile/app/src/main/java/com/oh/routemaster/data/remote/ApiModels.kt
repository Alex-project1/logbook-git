package com.oh.routemaster.data.remote

data class MobileLoginRequest(
    val login: String,
    val password: String
)

data class MobileLoginResponse(
    val accessToken: String,
    val user: BootstrapMobileUserDto?
)

data class MobileUserDto(
    val id: Int,
    val login: String,
    val city: CityDto
)

data class CityDto(
    val id: Int,
    val name: String
)

data class DeviceTokenRequest(
    val token: String,
    val platform: String = "android",
    val deviceName: String? = null
)

data class ApiDataResponse<T>(
    val data: T
)

data class MobileNotificationsResponse(
    val pagination: PaginationDto,
    val data: List<MobileNotificationDto>
)

data class PaginationDto(
    val page: Int,
    val pageSize: Int,
    val total: Int,
    val totalPages: Int
)

data class MobileNotificationDto(
    val id: Int,
    val recipientId: Int,
    val title: String,
    val message: String,
    val city: CityDto,
    val senderUser: NotificationSenderDto?,
    val createdAt: String,
    val sentAt: String,
    val deliveredAt: String?,
    val readAt: String?,
    val repliedAt: String?,
    val replyText: String?,
    val status: String
)

data class NotificationSenderDto(
    val id: Int,
    val name: String?,
    val login: String
)

data class UnreadCountResponse(
    val unreadCount: Int
)

data class ReplyNotificationRequest(
    val replyText: String
)

data class MobileBootstrapDto(
    val city: CityDto,
    val mobileUser: BootstrapMobileUserDto?,
    val permissions: MobilePermissionsDto? = null,
    val employees: List<EmployeeDto>,
    val vehicles: List<VehicleDto>,
    val crews: List<CrewDto>,
    val dutyPosts: List<DutyPostDto>,
    val tripGoals: List<TripGoalDto>,
    val additionalAlarmReasons: List<AdditionalAlarmReasonDto>,
    val streets: List<StreetDto>,
    val settings: MobileSettingsDto?,
    val notifications: BootstrapNotificationsDto?
)

data class BootstrapMobileUserDto(
    val id: Int,
    val login: String,
    val userKind: String? = null,
    val cityId: Int? = null,
    val departmentId: Int? = null,
    val crewId: Int? = null,
    val dutyPostId: Int? = null,
    val displayName: String? = null,
    val city: CityDto? = null,
    val department: MobileDepartmentDto? = null,
    val crew: CrewDto? = null,
    val dutyPost: DutyPostDto? = null
)

data class MobileDepartmentDto(
    val id: Int,
    val name: String,
    val type: String
)

data class MobilePermissionsDto(
    val canUseObjects: Boolean = false
)
data class EmployeeDto(
    val id: Int,
    val fullName: String
)

data class VehicleDto(
    val id: Int,
    val title: String,
    val licensePlate: String?
)

data class CrewDto(
    val id: Int,
    val name: String
)
data class DutyPostDto(
    val id: Int,
    val name: String,
    val comment: String?
)
data class TripGoalDto(
    val id: Int,
    val name: String,
    val systemCode: String?
)

data class AdditionalAlarmReasonDto(
    val id: Int,
    val name: String
)

data class StreetDto(
    val id: Int,
    val name: String
)

data class MobileSettingsDto(
    val offlineEnabled: Boolean
)

data class BootstrapNotificationsDto(
    val unreadCount: Int
)
data class CreatePostDutyRequest(
    val postId: Int,
    val vehicleId: Int?,
    val dutyDate: String,
    val durationHours: Double,
    val note: String?,
    val members: List<CreatePostDutyMemberRequest>
)

data class CreatePostDutyMemberRequest(
    val employeeId: Int,
    val hasWeapon: Boolean,
    val isDriver: Boolean,
    val comment: String?
)

data class CreatedPostDutyDto(
    val id: Int,
    val cityId: Int,
    val postId: Int,
    val vehicleId: Int?,
    val dutyDate: String,
    val durationHours: Double,
    val shiftEquivalent: Double,
    val note: String?
)

data class CreateMobileShiftRequest(
    val localShiftId: String,
    val crewId: Int,
    val vehicleId: Int,
    val driverEmployeeId: Int,
    val driverHasWeapon: Boolean,
    val seniorEmployeeId: Int,
    val seniorHasWeapon: Boolean,
    val shiftDate: String,
    val odometerStart: Int,
    val trips: List<CreateMobileShiftTripRequest>
)

data class CreateMobileShiftTripRequest(
    val fromLocation: String,
    val departureTime: String,
    val toLocation: String,
    val arrivalTime: String,
    val distanceKm: Double,
    val goalId: Int,
    val note: String?,
    val events: List<CreateMobileShiftTripEventRequest> = emptyList()
)

data class CreateMobileShiftTripEventRequest(
    val eventCategory: String,
    val alarmSource: String?,
    val countTotal: Int?,
    val isCombat: Boolean?,
    val reasonId: Int?,
    val customReasonText: String?,
    val ohCount: Int?,
    val partnerCount: Int?,
    val detainedCount: Int?,
    val transferredCount: Int?,
    val note: String?
)

data class CreatedMobileShiftResponse(
    val message: String,
    val data: CreatedMobileShiftDto,
    val duplicated: Boolean
)

data class CreatedMobileShiftDto(
    val id: Int,
    val localShiftId: String,
    val submittedAt: String?,
    val odometerStart: Int,
    val totalDistanceKm: Double,
    val odometerEndCalculated: Int,
    val summary: CreatedMobileShiftSummaryDto?
)

data class CreatedMobileShiftSummaryDto(
    val totalDistanceKm: Double,
    val odometerDistanceRounded: Int,
    val totalAlarms: Int,
    val totalOh: Int,
    val totalPartner: Int,
    val regularOh: Int,
    val regularPartner: Int,
    val combatTotal: Int,
    val combatOh: Int,
    val combatPartner: Int,
    val falseTotal: Int,
    val falseOh: Int,
    val falsePartner: Int,
    val additionalTotal: Int,
    val additionalOh: Int,
    val additionalPartner: Int,
    val detained: Int,
    val transferred: Int
)

data class MobileHistoryResponse(
    val pagination: PaginationDto,
    val data: List<MobileHistoryItemDto>
)

data class MobileHistoryItemDto(
    val type: String,
    val id: Int,
    val date: String,
    val title: String,
    val shift: MobileHistoryShiftDto?,
    val postDuty: MobileHistoryPostDutyDto?
)

data class MobileHistoryShiftDto(
    val id: Int,
    val date: String,
    val crew: CrewDto,
    val vehicle: VehicleDto,
    val driver: MobileHistoryShiftEmployeeRoleDto,
    val senior: MobileHistoryShiftEmployeeRoleDto,
    val odometerStart: Int,
    val odometerEndCalculated: Int,
    val totalDistanceKm: Double,
    val summary: MobileHistoryShiftSummaryDto,
    val trips: List<MobileHistoryTripDto>
)

data class MobileHistoryShiftEmployeeRoleDto(
    val employee: EmployeeDto,
    val hasWeapon: Boolean
)

data class MobileHistoryShiftSummaryDto(
    val totalAlarms: Int,
    val totalOh: Int,
    val totalPartner: Int,
    val regularTotal: Int,
    val regularOh: Int,
    val regularPartner: Int,
    val combatTotal: Int,
    val combatOh: Int,
    val combatPartner: Int,
    val falseTotal: Int,
    val falseOh: Int,
    val falsePartner: Int,
    val additionalTotal: Int,
    val additionalOh: Int,
    val additionalPartner: Int,
    val additionalReasons: List<MobileHistoryAdditionalReasonDto>,
    val detained: Int,
    val transferred: Int
)

data class MobileHistoryAdditionalReasonDto(
    val label: String,
    val total: Int,
    val oh: Int,
    val partner: Int
)

data class MobileHistoryTripDto(
    val id: Int,
    val fromLocation: String,
    val toLocation: String,
    val departureTime: String,
    val arrivalTime: String,
    val distanceKm: Double,
    val goal: TripGoalDto,
    val events: List<MobileHistoryTripEventDto>
)

data class MobileHistoryTripEventDto(
    val id: Int,
    val eventCategory: String,
    val alarmSource: String?,
    val countTotal: Int,
    val isCombat: Boolean?,
    val reason: AdditionalAlarmReasonDto?,
    val customReasonText: String?,
    val ohCount: Int,
    val partnerCount: Int,
    val detainedCount: Int,
    val transferredCount: Int,
    val note: String?
)

data class MobileHistoryPostDutyDto(
    val id: Int,
    val date: String,
    val post: DutyPostShortDto,
    val vehicle: VehicleDto?,
    val durationHours: Double,
    val shiftEquivalent: Double,
    val note: String?,
    val members: List<MobileHistoryPostDutyMemberDto>
)

data class DutyPostShortDto(
    val id: Int,
    val name: String
)

data class MobileHistoryPostDutyMemberDto(
    val id: Int,
    val employee: EmployeeDto,
    val hasWeapon: Boolean,
    val isDriver: Boolean,
    val comment: String?
)

data class MobileObjectsOverviewResponse(
    val city: CityDto,
    val externalRegionId: Int,
    val center: MobileMapCenterDto,
    val total: Int,
    val gbrCallsigns: List<String> = emptyList()
)

data class MobileObjectClustersResponse(
    val city: CityDto,
    val externalRegionId: Int,
    val center: MobileMapCenterDto,
    val zoom: Int,
    val total: Int,
    val visible: Int,
    val data: List<MobileObjectClusterDto>
)

data class MobileObjectClusterDto(
    val id: String,
    val type: String,
    val lat: Double,
    val lng: Double,
    val count: Int,
    val accountNumber: String?,
    val title: String?,
    val clientName: String?,
    val address: String?,
    val cardUrl: String?,
    val gbr: String?,
    val gbrReserve: String?,
    val gbrReserve2: String?,
    val objects: List<MobileObjectDto>?
)

data class MobileObjectsResponse(
    val city: CityDto,
    val externalRegionId: Int,
    val center: MobileMapCenterDto,
    val data: List<MobileObjectDto>
)

data class MobileObjectSearchResponse(
    val data: List<MobileObjectDto>
)

data class MobileMapCenterDto(
    val lat: Double,
    val lng: Double
)

data class MobileObjectDto(
    val accountNumber: String,
    val title: String,
    val clientName: String,
    val address: String,
    val lat: Double?,
    val lng: Double?,
    val cardUrl: String?,
    val rawRegionId: Int?,
    val gbr: String?,
    val gbrReserve: String?,
    val gbrReserve2: String?
)
