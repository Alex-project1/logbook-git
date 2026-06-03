package com.oh.routemaster.data.remote

import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST


import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query


interface RouteMasterApi {
    @POST("api/mobile/login")
    suspend fun login(
        @Body body: MobileLoginRequest
    ): MobileLoginResponse

    @POST("api/mobile/device-token")
    suspend fun registerDeviceToken(
        @Header("Authorization") authorization: String,
        @Body body: DeviceTokenRequest
    ): ApiDataResponse<DeviceTokenResponse>

        @GET("api/mobile/notifications/unread-count")
    suspend fun getUnreadNotificationsCount(
        @Header("Authorization") authorization: String
    ): ApiDataResponse<UnreadCountResponse>

    @GET("api/mobile/notifications")
    suspend fun getNotifications(
        @Header("Authorization") authorization: String,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20
    ): MobileNotificationsResponse

    @GET("api/mobile/notifications/{id}")
    suspend fun getNotificationById(
        @Header("Authorization") authorization: String,
        @Path("id") id: Int
    ): ApiDataResponse<MobileNotificationDto>

    @POST("api/mobile/notifications/{id}/read")
    suspend fun markNotificationAsRead(
        @Header("Authorization") authorization: String,
        @Path("id") id: Int
    ): ApiDataResponse<MobileNotificationDto>

    @POST("api/mobile/notifications/{id}/reply")
    suspend fun replyNotification(
        @Header("Authorization") authorization: String,
        @Path("id") id: Int,
        @Body body: ReplyNotificationRequest
    ): ApiDataResponse<MobileNotificationDto>

      @GET("api/mobile/bootstrap")
suspend fun getBootstrap(
    @Header("Authorization") authorization: String
): MobileBootstrapDto

@POST("api/mobile/post-duties")
suspend fun createPostDuty(
    @Header("Authorization") authorization: String,
    @Body body: CreatePostDutyRequest
): ApiDataResponse<CreatedPostDutyDto>

@POST("api/mobile/shifts")
suspend fun createMobileShift(
    @Header("Authorization") authorization: String,
    @Body body: CreateMobileShiftRequest
): CreatedMobileShiftResponse

    @GET("api/mobile/history")
    suspend fun getMobileHistory(
        @Header("Authorization") authorization: String
    ): MobileHistoryResponse

    @GET("api/mobile/objects/overview")
    suspend fun getMobileObjectsOverview(
        @Header("Authorization") authorization: String
    ): MobileObjectsOverviewResponse

    @GET("api/mobile/objects/clusters")
    suspend fun getMobileObjectClusters(
        @Header("Authorization") authorization: String,
        @Query("zoom") zoom: Int,
        @Query("south") south: Double,
        @Query("west") west: Double,
        @Query("north") north: Double,
        @Query("east") east: Double,
        @Query("gbr") gbr: String? = null
    ): MobileObjectClustersResponse

    @GET("api/mobile/objects/search")
    suspend fun searchMobileObject(
        @Header("Authorization") authorization: String,
        @Query("accountNumber") accountNumber: String
    ): MobileObjectSearchResponse

}

data class DeviceTokenResponse(
    val id: Int,
    val platform: String?,
    val deviceName: String?,
    val lastSeenAt: String
)