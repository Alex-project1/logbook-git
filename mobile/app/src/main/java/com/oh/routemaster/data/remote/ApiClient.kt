package com.oh.routemaster.data.remote

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object ApiClient {
    /*
     * Для Android Emulator:
     * 10.0.2.2 = localhost компьютера, где запущен backend.
     *
     * Если тестируешь на реальном телефоне, замени на IP компьютера в Wi-Fi:
     * http://192.168.1.100:5000/
     */
  private const val BASE_URL = "http://127.0.0.1:5000/"

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .build()

    val api: RouteMasterApi by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(RouteMasterApi::class.java)
    }
}