package com.oh.routemaster.services

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object PendingSubmissionWorkScheduler {
    private const val ONE_TIME_WORK_NAME = "route_master_pending_submissions_now"
    private const val PERIODIC_WORK_NAME = "route_master_pending_submissions_periodic"

    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun enqueueNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<PendingSubmissionWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1,
                TimeUnit.MINUTES
            )
            .build()

        WorkManager
            .getInstance(context.applicationContext)
            .enqueueUniqueWork(
                ONE_TIME_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            )
    }

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<PendingSubmissionWorker>(
            15,
            TimeUnit.MINUTES
        )
            .setConstraints(networkConstraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                5,
                TimeUnit.MINUTES
            )
            .build()

        WorkManager
            .getInstance(context.applicationContext)
            .enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
    }
}
