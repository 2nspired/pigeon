export type ServiceError = {
	code: string;
	message: string;
};

export type ServiceResult<T> = { success: true; data: T } | { success: false; error: ServiceError };

/** Extract the data type from a ServiceResult */
export type UnwrapServiceResult<T> = T extends ServiceResult<infer U> ? U : never;
