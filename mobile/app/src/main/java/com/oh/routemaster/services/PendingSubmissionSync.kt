package com.oh.routemaster.services

import com.google.gson.Gson
import com.oh.routemaster.data.local.PENDING_KIND_GBR_SHIFT
import com.oh.routemaster.data.local.PENDING_KIND_POST_DUTY
import com.oh.routemaster.data.local.PendingSubmissionItem
import com.oh.routemaster.data.local.PendingSubmissionStore
import com.oh.routemaster.data.remote.ApiClient
import com.oh.routemaster.data.remote.CreateMobileShiftRequest
import com.oh.routemaster.data.remote.CreatePostDutyRequest
import java.io.IOException

suspend fun syncPendingSubmissions(
    accessToken: String,
    store: PendingSubmissionStore,
    gson: Gson = Gson()
): PendingSubmissionSyncResult {
    val pending = store.getPending(gson)

    if (pending.isEmpty()) {
        return PendingSubmissionSyncResult(sent = 0, failed = 0, remaining = 0)
    }

    val remaining = mutableListOf<PendingSubmissionItem>()
    var sent = 0
    var failed = 0

    for (item in pending) {
        try {
            when (item.kind) {
                PENDING_KIND_GBR_SHIFT -> {
                    val body = gson.fromJson(item.bodyJson, CreateMobileShiftRequest::class.java)
                    ApiClient.api.createMobileShift(
                        authorization = "Bearer $accessToken",
                        body = body
                    )
                    sent += 1
                }

                PENDING_KIND_POST_DUTY -> {
                    val body = gson.fromJson(item.bodyJson, CreatePostDutyRequest::class.java)
                    ApiClient.api.createPostDuty(
                        authorization = "Bearer $accessToken",
                        body = body
                    )
                    sent += 1
                }

                else -> {
                    remaining.add(item)
                    failed += 1
                }
            }
        } catch (exception: IOException) {
            remaining.add(item)
            failed += 1
        } catch (exception: Exception) {
            // HTTP 400/500 или неожиданная ошибка: не удаляем из очереди, чтобы не потерять данные.
            exception.printStackTrace()
            remaining.add(item)
            failed += 1
        }
    }

    store.savePending(remaining, gson)

    return PendingSubmissionSyncResult(
        sent = sent,
        failed = failed,
        remaining = remaining.size
    )
}

data class PendingSubmissionSyncResult(
    val sent: Int,
    val failed: Int,
    val remaining: Int
)
