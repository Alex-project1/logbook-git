package com.oh.routemaster.services

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import com.oh.routemaster.data.local.PendingSubmissionStore
import com.oh.routemaster.data.local.TokenStore
import kotlinx.coroutines.flow.firstOrNull

class PendingSubmissionWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val accessToken = TokenStore(applicationContext)
            .accessTokenFlow
            .firstOrNull()

        if (accessToken.isNullOrBlank()) {
            return Result.success()
        }

        val store = PendingSubmissionStore(applicationContext)
        val gson = Gson()

        return try {
            val result = syncPendingSubmissions(
                accessToken = accessToken,
                store = store,
                gson = gson
            )

            if (result.remaining == 0) {
                Result.success()
            } else {
                Result.retry()
            }
        } catch (exception: Exception) {
            exception.printStackTrace()
            Result.retry()
        }
    }
}
